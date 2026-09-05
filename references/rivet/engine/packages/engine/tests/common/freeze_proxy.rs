//! Minimal TCP forwarder with a `freeze` mode used by network-fault tests.
//!
//! Toxiproxy can stall traffic but always relays a peer's TCP close to the other side, which
//! defeats tests that need to observe one peer's behavior when it has no signal that the other
//! peer hung up. `FreezeProxy` is a single-purpose forwarder that supports a true black-hole
//! mode: while frozen, bytes are read from each peer and discarded, and an EOF from either peer
//! is held instead of being forwarded.

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::{Context, Result};
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::{TcpListener, TcpStream};

pub struct FreezeProxy {
	listen_addr: SocketAddr,
	frozen: Arc<AtomicBool>,
}

impl FreezeProxy {
	pub async fn start(upstream: SocketAddr) -> Result<Self> {
		let listener = TcpListener::bind("127.0.0.1:0")
			.await
			.context("failed to bind FreezeProxy listener")?;
		let listen_addr = listener
			.local_addr()
			.context("failed to read FreezeProxy listen addr")?;
		let frozen = Arc::new(AtomicBool::new(false));

		tokio::spawn({
			let frozen = frozen.clone();
			async move {
				loop {
					let (client, _) = match listener.accept().await {
						Ok(pair) => pair,
						Err(err) => {
							tracing::warn!(?err, "freeze proxy accept failed");
							return;
						}
					};
					let _ = client.set_nodelay(true);
					let frozen = frozen.clone();
					tokio::spawn(async move {
						let server = match TcpStream::connect(upstream).await {
							Ok(stream) => stream,
							Err(err) => {
								tracing::warn!(?err, %upstream, "freeze proxy upstream connect failed");
								return;
							}
						};
						let _ = server.set_nodelay(true);
						let (client_r, client_w) = client.into_split();
						let (server_r, server_w) = server.into_split();
						tokio::spawn(forward(client_r, server_w, frozen.clone()));
						tokio::spawn(forward(server_r, client_w, frozen));
					});
				}
			}
		});

		Ok(Self {
			listen_addr,
			frozen,
		})
	}

	pub fn endpoint(&self) -> String {
		format!("http://{}", self.listen_addr)
	}

	/// Stops shuttling bytes between the two peers and starts swallowing EOFs so neither peer
	/// learns that the other has hung up. Bytes already in flight before this call may still
	/// reach the other side.
	pub fn freeze(&self) {
		self.frozen.store(true, Ordering::SeqCst);
	}
}

async fn forward(mut src: OwnedReadHalf, mut dst: OwnedWriteHalf, frozen: Arc<AtomicBool>) {
	let mut buf = vec![0u8; 8192];
	loop {
		match src.read(&mut buf).await {
			Ok(0) => {
				if frozen.load(Ordering::SeqCst) {
					// Hold the destination open: the peer's own send/recv buffer keeps it
					// believing the connection is alive, with no FIN ever delivered.
					std::future::pending::<()>().await;
				}
				return;
			}
			Ok(n) => {
				if frozen.load(Ordering::SeqCst) {
					// Drain-and-discard so the sender's TCP window stays open and it does not
					// notice the link is dead via back-pressure.
					continue;
				}
				if dst.write_all(&buf[..n]).await.is_err() {
					return;
				}
			}
			Err(_) => return,
		}
	}
}
