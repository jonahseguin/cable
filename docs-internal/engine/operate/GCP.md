## Deploy

```
./scripts/tf/apply.sh cloud-staging
```

## SSH in to server

```
gcloud compute ssh --zone "us-east1-b" "scr-rivet-engine-33pr" --project "cloud-staging-473319" --tunnel-through-iap
```

## Read logs

```
sudo journalctl -u rivet-engine
```
