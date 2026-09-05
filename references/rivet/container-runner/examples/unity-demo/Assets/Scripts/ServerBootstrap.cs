using System;
using FishNet.Managing;
using FishNet.Managing.Transporting;
using FishNet.Transporting.Bayou;
using FishNet.Transporting.Tugboat;
using FishNet.Transporting;
using FishNet.Connection;
using UnityEngine;

/// Headless bootstrap for the official FishNet NetworkTransform demo with Bayou
/// (WebSocket) as the active transport.
///
/// - Resolves the listen/connect port from `$PORT` or `-port <n>` (default 7770) so it
///   works as the container-runner's child (which sets $PORT).
/// - Sets that port on the active transport (Bayou, wired up by ProjectBootstrap).
/// - As a dedicated server / -batchmode build: starts the server socket.
/// - As a client (`-client [-url ws://host/gateway/id/]` or `[-address <host>]`):
///   connects and logs the FishNet state.
[DefaultExecutionOrder(-10000)]
public class ServerBootstrap : MonoBehaviour
{
    private NetworkManager _nm;

    private void Awake()
    {
        _nm = GetComponent<NetworkManager>();
        if (_nm == null)
            _nm = FindAnyObjectByType<NetworkManager>();

        if (HasArg("-tugboat"))
        {
            Tugboat tugboat = _nm.GetComponent<Tugboat>();
            if (tugboat == null)
                tugboat = _nm.gameObject.AddComponent<Tugboat>();

            TransportManager transportManager = _nm.GetComponent<TransportManager>();
            if (transportManager == null)
                transportManager = _nm.gameObject.AddComponent<TransportManager>();
            transportManager.Transport = tugboat;
            Debug.Log("[bootstrap] using Tugboat transport");
        }
    }

    private void Start()
    {
        ushort port = ResolvePort(7770);
        Transport transport = _nm.TransportManager.Transport;
        transport.SetPort(port);

        bool isClient = HasArg("-client");
        if (isClient)
        {
            string address = ArgValue("-address") ?? "127.0.0.1";
            string path = ArgValue("-path") ?? "/";
            string url = ArgValue("-url");
            bool useWss = false;
            if (!string.IsNullOrWhiteSpace(url) && Uri.TryCreate(url, UriKind.Absolute, out Uri uri))
            {
                address = uri.Host;
                path = string.IsNullOrEmpty(uri.PathAndQuery) ? "/" : uri.PathAndQuery;
                port = (ushort)(uri.IsDefaultPort ? (uri.Scheme == "wss" ? 443 : 80) : uri.Port);
                useWss = uri.Scheme == "wss";
            }
            string subprotocol = ArgValue("-subprotocol") ?? "";
            transport.SetPort(port);
            transport.SetClientAddress(address);
            if (transport is Bayou bayou)
            {
                bayou.SetUseWSS(useWss);
                bayou.SetClientPath(path);
                bayou.SetClientSubprotocol(subprotocol);
            }
            _nm.ClientManager.OnClientConnectionState += OnClientState;
            // Latency HUD: only useful in a windowed client.
            if (!Application.isBatchMode)
            {
                _hudEnabled = true;
                _nm.TimeManager.OnRoundTripTimeUpdated += OnRttUpdated;
            }
            Debug.Log($"[bootstrap] starting CLIENT -> {address}:{port}{path}");
            _nm.ClientManager.StartConnection();
        }
        else
        {
            _nm.ServerManager.OnServerConnectionState += OnServerState;
            _nm.ServerManager.OnRemoteConnectionState += OnRemoteState;
            Debug.Log($"[bootstrap] starting SERVER on port {port}");
            _nm.ServerManager.StartConnection();

            if (ShouldAutoStartLocalClient())
            {
                _nm.ClientManager.OnClientConnectionState += OnClientState;
                Debug.Log($"[bootstrap] starting LOCAL CLIENT -> 127.0.0.1:{port}/");
                _nm.ClientManager.StartConnection("127.0.0.1", port);
            }
        }
    }

    private static bool ShouldAutoStartLocalClient()
    {
        if (Application.isBatchMode)
            return false;
        if (HasArg("-serverOnly"))
            return false;
        return true;
    }

    // --- latency HUD (client only) -------------------------------------------------
    // FishNet's RoundTripTime "includes latency from the tick rate" (see TimeManager),
    // so it is NOT pure network RTT. We show the raw value plus the tick-rate component
    // so a bad reading can be attributed to the wire vs. the tick.
    private readonly System.Collections.Generic.List<long> _rttSamples = new();
    private long _rttLast;
    private bool _hudEnabled;
    private GUIStyle _hudStyle;

    private void OnRttUpdated(long rtt)
    {
        _rttLast = rtt;
        _rttSamples.Add(rtt);
        if (_rttSamples.Count > 600)
            _rttSamples.RemoveAt(0);
    }

    private void OnGUI()
    {
        if (!_hudEnabled || _nm == null)
            return;

        _hudStyle ??= new GUIStyle(GUI.skin.label)
        {
            fontSize = 14,
            normal = { textColor = Color.white },
        };

        long avg = 0, min = 0, max = 0, p95 = 0;
        int n = _rttSamples.Count;
        if (n > 0)
        {
            var sorted = new System.Collections.Generic.List<long>(_rttSamples);
            sorted.Sort();
            min = sorted[0];
            max = sorted[n - 1];
            p95 = sorted[Mathf.Min(n - 1, Mathf.FloorToInt(n * 0.95f))];
            long sum = 0;
            foreach (long v in sorted) sum += v;
            avg = sum / n;
        }

        ushort tickRate = _nm.TimeManager.TickRate;
        double tickMs = tickRate > 0 ? 1000d / tickRate : 0d;

        var rect = new Rect(10, 10, 460, 110);
        GUI.Box(rect, GUIContent.none);
        GUILayout.BeginArea(new Rect(18, 16, 450, 100));
        GUILayout.Label($"RTT {_rttLast} ms   (avg {avg}  min {min}  p95 {p95}  max {max}, n={n})", _hudStyle);
        GUILayout.Label($"tick {tickRate} Hz -> ~{tickMs:F0} ms of that RTT is tick quantization", _hudStyle);
        GUILayout.Label($"one-way (half RTT) ~{_nm.TimeManager.HalfRoundTripTime} ms", _hudStyle);
        GUILayout.EndArea();
    }

    private void OnClientState(ClientConnectionStateArgs args)
    {
        Debug.Log($"[bootstrap] client connection state: {args.ConnectionState}");
        if (args.ConnectionState == LocalConnectionState.Started)
            Debug.Log("[bootstrap] CLIENT CONNECTED");
    }

    private void OnServerState(ServerConnectionStateArgs args)
    {
        Debug.Log($"[bootstrap] server connection state: {args.ConnectionState}");
        if (args.ConnectionState == LocalConnectionState.Started)
            Debug.Log("[bootstrap] SERVER STARTED");
    }

    private void OnRemoteState(NetworkConnection conn, RemoteConnectionStateArgs args)
    {
        Debug.Log($"[bootstrap] remote client {conn.ClientId} state: {args.ConnectionState}");
        if (args.ConnectionState == RemoteConnectionState.Started)
            Debug.Log($"[bootstrap] SERVER ACCEPTED CLIENT {conn.ClientId}");
    }

    private static ushort ResolvePort(ushort dflt)
    {
        string env = Environment.GetEnvironmentVariable("PORT");
        if (ushort.TryParse(env, out ushort p)) return p;
        string arg = ArgValue("-port");
        if (arg != null && ushort.TryParse(arg, out ushort p2)) return p2;
        return dflt;
    }

    private static bool HasArg(string name)
    {
        foreach (string a in Environment.GetCommandLineArgs())
            if (a == name) return true;
        return false;
    }

    private static string ArgValue(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i] == name) return args[i + 1];
        return null;
    }
}
