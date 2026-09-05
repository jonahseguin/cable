# unity-demo - FishNet + Bayou starter

A simple FishNet starter project using the **Bayou** WebSocket transport. It can run
directly in the Unity editor for local development, or as the child process behind
`container-runner` for local Rivet actor testing.

- **FishNet** 4.7.2 embedded from FirstGearGames/FishNet.
- **Bayou** 4.1.0 embedded from FirstGearGames/Bayou.
- `Assets/Scenes/Main.unity` is the only project scene.
- `ProjectBootstrap` creates/updates the scene with a `NetworkManager`, FishNet managers,
  Bayou transport, and `ServerBootstrap`.
- The server reads its port from `$PORT` / `-port` so it binds the port the container-runner
  gives it.

## Layout

```
Packages/com.firstgeargames.*   embedded official FishNet + Bayou packages
Packages/manifest.json          trimmed Unity package manifest using embedded packages
Assets/Scenes/Main.unity        simple starter scene
Assets/Scripts/ServerBootstrap  port from $PORT/-port; start server (or client with -client)
Assets/Editor/ProjectBootstrap  creates/updates Main.unity and wires NetworkManager->Bayou
Assets/Editor/BuildScript       headless dedicated-server (mac/Linux) + demo player builds
setup-and-build.sh              resolve packages, prepare scene, build
```

## Local Unity dev

Open this folder in Unity:

```text
unity-demo/
```

Open this scene:

```text
Assets/Scenes/Main.unity
```

If the scene needs to be regenerated or rewired, run:

```text
Tools -> Setup FishNet Multiplayer Demo
```

Press Play to start a local server and local client in the editor. Move the player with
WASD or arrow keys.

## FishNet/Bayou changes in this repo

The embedded packages are official FirstGearGames sources, with small local changes needed
to build under Unity `6000.5.2f1` and to make the starter reliable in headless e2e:

- `Packages/com.firstgeargames.fishnet.bayou/package.json`
  - Bumps the FishNet dependency to `4.7.2` so Bayou resolves against the embedded FishNet
    package used by this project.
- `Packages/com.firstgeargames.fishnet.bayou/SimpleWebTransport/Common/Request.cs`
  - Adds the missing SimpleWeb request parser type used by Bayou's WebSocket handshake.
- `Packages/com.firstgeargames.fishnet/Runtime/Managing/Scened/SceneHandleCompatibility.cs`
  - Adds a compatibility helper for Unity `6000.5`, where `Scene.handle` is no longer a
    plain integer API.
- FishNet scene-handle call sites were updated to use that helper:
  - `Runtime/Managing/Scened/UnloadedScene.cs`
  - `Runtime/Managing/Scened/SceneLookupData.cs`
  - `Runtime/Managing/Scened/SceneManager.cs`
  - `Runtime/Serializing/SceneComparer.cs`
  - `Runtime/Serializing/Helping/Comparers.cs`
- `Packages/com.firstgeargames.fishnet/Runtime/Observing/NetworkObserver.cs`
  - Avoids the obsolete-as-error `GetInstanceID()` destroyed-object check on Unity
    `6000.5`.
- `Packages/com.firstgeargames.fishnet/Demos/`
  - Removed from the embedded package so the starter does not compile or ship FishNet's
    sample scenes, sample prefabs, or `FishNet.Demos.dll`.
- `Packages/com.firstgeargames.fishnet.bayou/SimpleWebTransport/Client/StandAlone/ClientHandshake.cs`
  - Adds an optional `Sec-WebSocket-Protocol` header so standalone clients can offer
    Rivet's required `rivet` WebSocket subprotocol.
- `Packages/com.firstgeargames.fishnet.bayou/Core/ClientSocket.cs`
  - Preserves a non-root WebSocket path/query when constructing the client URI. This
    lets Bayou connect to Rivet's `/gateway/<actor_id>/` route instead of only `/`.
- `Packages/com.firstgeargames.fishnet.bayou/Bayou.cs`
  - Exposes client path and subprotocol setters used by the command-line e2e client.
- `Packages/com.firstgeargames.fishnet.bayou/SimpleWebTransport/Client/SimpleWebClient.cs`
  and `.../StandAlone/WebSocketClientStandAlone.cs`
  - Thread the optional subprotocol from Bayou down into the standalone WebSocket
    handshake.

The e2e signal is the FishNet/Bayou connection itself: the client logs
`CLIENT CONNECTED`, and the server logs `SERVER ACCEPTED CLIENT`.

## Project wiring added around FishNet

- `Packages/manifest.json`
  - Keeps only FishNet, Bayou, and core Unity modules needed by this starter.
  - Removes Unity Purchasing, Analytics, Timeline, XR helpers, and other template packages
    that are unrelated to server networking.
- `Assets/Editor/ProjectBootstrap.cs`
  - Creates or opens `Assets/Scenes/Main.unity`.
  - Ensures the `NetworkManager` has `TimeManager`, `TransportManager`, `ClientManager`,
    `ServerManager`, `Bayou`, and `ServerBootstrap`.
  - Sets Bayou to plain WebSocket on `127.0.0.1:7770`.
  - Adds a camera/light for a normal Unity editor view.
  - Registers only `Assets/Scenes/Main.unity` in Build Settings.
- `Assets/Scripts/ServerBootstrap.cs`
  - Reads `$PORT` or `-port`.
  - Starts server mode by default.
  - Starts client mode with `-client -url <ws-url>` or `-client -address <host>`.
  - Accepts `-path <path>` and `-subprotocol <value>` for Rivet guard connections.
  - Emits the log markers used by `run-host-fishnet.sh`.

## Prerequisite: an activated Unity license

Batch/headless builds require a signed-in Unity license (Personal is free). Open **Unity
Hub → sign in** and make sure a license is active. Without it, `Unity -batchmode ...` fails
with "No valid Unity Editor license found". Verified editor:
`/Applications/Unity/Hub/Editor/6000.5.2f1/Unity.app`.

## Build for local e2e

```bash
unity-demo/setup-and-build.sh demo    # macOS player (runs as server or client) — for local e2e
unity-demo/setup-and-build.sh mac      # macOS Dedicated Server
unity-demo/setup-and-build.sh linux    # Linux Dedicated Server, for the future deploy image
```

Output under `unity-demo/Builds/`. The macOS build is a `.app`; the runnable binary is
`GameDemo.app/Contents/MacOS/<ProductName>`.

## End-to-end (host)

```bash
e2e-test/host/run-host-fishnet.sh
```

Starts the engine + container-runner (wrapping the Unity server), creates a Rivet actor
(which spawns the Unity server as the child), then runs a FishNet **client** that connects
through the Rivet guard gateway to Bayou on the child port. Verifies the container-runner
hosts a real Unity server and that FishNet/Bayou networking works through Rivet. The host
FishNet runner defaults its serverless front door to `:18080` to avoid common local
`:8080` collisions.

## Rivet tunnel

The container-runner proxies Rivet's tunneled WebSocket to the child's local port, so the
**server** side needs no FishNet-specific tunnel changes. The **client** reaches the
server through Rivet's guard by connecting to `ws://<guard>/gateway/<actor_id>/` and
offering the `rivet` WebSocket subprotocol. `run-host-fishnet.sh` now launches the Unity
client this way:

```bash
GameDemo.app/Contents/MacOS/unity-demo \
  -batchmode -nographics -client \
  -url ws://127.0.0.1:7420/gateway/<actor_id>/ \
  -subprotocol rivet
```

The local Bayou/SimpleWebTransport patches listed above are what make this possible for
the standalone macOS player. For production WebGL clients, the same behavior is needed in
the browser WebSocket path: use the Rivet guard URL and offer the `rivet` subprotocol.

## Rivet Compute

Not wired yet. The next step is to build the **Linux** Dedicated Server, put it in the
production game container, and launch it through `rivet-container-runner`:

```dockerfile
ENTRYPOINT ["rivet-container-runner", "--", "/app/GameServer", "-batchmode", "-nographics"]
```
