# depot operator scripts

## compaction_backlog.py

Answers "how much compaction work is left" by reading depot state directly from FoundationDB. Every
read is a snapshot read and nothing is ever written, so it cannot conflict with live traffic.

The script needs three things that an engine pod does not have out of the box: a Python
interpreter, the FoundationDB Python bindings, and a cluster file. The pod already has `libfdb_c.so`,
which is the part that would otherwise be painful.

### 1. Find the shell pod

Run this on the shell pod, not on a pod serving traffic. Label conventions differ between clusters,
so match on the name rather than a label selector:

```bash
CTX=<kubectl-context>
POD=$(kubectl --context=$CTX get pods -n rivet-engine -o name \
  | grep rivet-engine-shell | head -1 | cut -d/ -f2)
```

If a cluster has no shell deployment, any `rivet-engine` pod works, but prefer the shell: a full
pass takes several minutes of CPU and the shell pod is not answering requests.

### 2. Install Python and the FoundationDB bindings

```bash
kubectl --context=$CTX exec -n rivet-engine $POD -- bash -c '
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends python3 python3-pip
  apt-get clean && rm -rf /var/lib/apt/lists/*
  pip3 install --break-system-packages --root-user-action=ignore -q "foundationdb>=7.3,<7.4"
  python3 -c "import fdb; fdb.api_version(730); print(\"ready\")"'
```

Three details matter here.

**Pin the bindings to the client library's major/minor.** An unpinned `pip install foundationdb`
resolves to the newest release, which requires a newer API version than the pod's `libfdb_c.so`
supports and fails at import with "the binding requires a library that supports API version 740".
The pin is the whole fix. To discover the version a pod supports:

```bash
kubectl --context=$CTX exec -n rivet-engine $POD -- python3 -c '
import fdb
for v in (740, 730, 720, 710):
    try:
        fdb.api_version(v); print("max supported api version:", v); break
    except RuntimeError: pass'
```

**`--no-install-recommends` is load-bearing.** Without it `python3-pip` pulls `build-essential`,
hundreds of megabytes against a pod whose `ephemeral-storage` limit is typically 1Gi; exceeding that
limit gets the pod evicted. With it, `python3` is about 35 MB and `python3-pip` a further 13 MB, and
no compiler is needed because the bindings are pure Python.

**`--break-system-packages`** satisfies PEP 668 on Debian trixie. A venv works too if you prefer.

#### If the cluster has no PyPI egress

The bindings are pure Python (~224 KB, `ctypes` only), so copy them instead. Skip `python3-pip`
above, then from a workstation:

```bash
pip download foundationdb==7.3.69 --no-deps -d /tmp/fdbpkg
tar xzf /tmp/fdbpkg/foundationdb-7.3.69.tar.gz -C /tmp/fdbpkg
kubectl --context=$CTX cp /tmp/fdbpkg/foundationdb-7.3.69/fdb rivet-engine/$POD:/tmp/fdb
```

They are then importable with `PYTHONPATH=/tmp`, which every command below would need adding.

### 4. Get a cluster file

Two cases, depending on how the engine is configured. Derive it on the pod so the connection string
never lands in a shell history or a terminal:

```bash
kubectl --context=$CTX exec -n rivet-engine $POD -- python3 -c '
import json
cfg = json.load(open("/etc/rivet/config.jsonc"))["foundationdb"]
if cfg.get("cluster_file"):
    # The engine was handed a real cluster file; use it directly.
    print(cfg["cluster_file"])
else:
    # The engine synthesizes one from description/id/addresses. Do the same.
    conn = "{}:{}@{}".format(
        cfg["cluster_description"], cfg["cluster_id"], ",".join(cfg["addresses"]))
    open("/tmp/fdb.cluster", "w").write(conn + "\n")
    print("/tmp/fdb.cluster")'
```

### 5. Run it

```bash
kubectl --context=$CTX cp compaction_backlog.py rivet-engine/$POD:/tmp/compaction_backlog.py
kubectl --context=$CTX exec -n rivet-engine $POD -- \
  python3 /tmp/compaction_backlog.py -C <cluster-file-from-step-4> \
  --concurrency 24 --batch-size 200 --byte-sample 20000 \
  --admission-percent 35 --hot-drain-span 8192 \
  --json /tmp/backlog-1.json
```

Pass `--admission-percent` and `--hot-drain-span` whenever the cluster has moved them off their
defaults, which both of the values above have. They are not cosmetic: the admission percent gates
the reclaim lane as well as the hot lane, so it decides which share of the backlog is merely behind
versus forbidden to start, and the drain span divides the remaining job count. Read the values in
effect from the last `applied dynamic config update` log line rather than assuming:

```bash
gcloud logging read \
  'resource.labels.container_name="rivet-engine" jsonPayload.message="applied dynamic config update"' \
  --project=<project> --limit=1 --freshness=24h --format='value(jsonPayload.dynamic)' \
  | grep -o 'compaction_[a-z_]*: Some([^)]*)'
```

Record a snapshot with `--json`, then compare a later run against it to get a drain rate and a
projected finish:

```bash
kubectl --context=$CTX exec -n rivet-engine $POD -- \
  python3 /tmp/compaction_backlog.py -C <cluster-file> \
  --since /tmp/backlog-1.json --json /tmp/backlog-2.json
```

Space the two runs hours apart. Back to back they mostly measure noise, and a single interval is an
order-of-magnitude reading at best.

### Tuning

`--concurrency * --batch-size` reads are outstanding at the peak. A client with too little CPU to
drain them fails the whole transaction on its timeout rather than merely running slow, so raise both
only as far as the pod's CPU allows. Measured:

| pod                     | flags                             | branches | wall time |
| ----------------------- | --------------------------------- | -------- | --------- |
| 500m CPU, 512Mi         | `--concurrency 8 --batch-size 200` | 651k     | ~7 min    |
| 4 CPU, 8Gi              | `--concurrency 24 --batch-size 200`| 2.23M    | ~8.5 min  |

Raise `--byte-sample` on a large deployment. The DELTA/SHARD/COMMITS split is sampled, and shard
bytes live on the minority of branches that have folded, so a thin sample makes that one figure
swing between runs. The subspace total, the live page data, and every txid figure are exact sums and
do not depend on it.

### Cleanup

Everything lands in the pod's writable layer and disappears on the next rollout. To clear it now:

```bash
kubectl --context=$CTX exec -n rivet-engine $POD -- \
  rm -rf /tmp/fdb /tmp/compaction_backlog.py /tmp/fdb.cluster /tmp/backlog-*.json
```
