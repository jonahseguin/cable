use std::net::SocketAddr;

use anyhow::{Context, Result};
use serde::Serialize;
use testcontainers::{
	GenericImage, ImageExt,
	core::{ContainerAsync, Host, IntoContainerPort},
	runners::AsyncRunner,
};

const ADMIN_PORT: u16 = 8474;
const DEFAULT_PROXY_PORT: u16 = 8666;

pub struct ToxiproxyTestServer {
	_container: ContainerAsync<GenericImage>,
	client: reqwest::Client,
	admin_base_url: String,
	proxy_port: u16,
}

#[derive(Clone)]
pub struct ToxiproxyProxy {
	client: reqwest::Client,
	admin_base_url: String,
	name: String,
	listen_addr: SocketAddr,
}

#[derive(Serialize)]
struct CreateProxyRequest<'a> {
	name: &'a str,
	listen: String,
	upstream: String,
	enabled: bool,
}

#[derive(Serialize)]
struct UpdateProxyRequest {
	enabled: bool,
}

#[derive(Serialize)]
struct CreateToxicRequest<'a, T>
where
	T: Serialize,
{
	name: &'a str,
	#[serde(rename = "type")]
	toxic_type: &'a str,
	stream: &'a str,
	toxicity: f32,
	attributes: T,
}

#[derive(Serialize)]
struct ResetPeerAttributes {
	timeout: u64,
}

#[derive(Serialize)]
struct LatencyAttributes {
	latency: u64,
	jitter: u64,
}

#[derive(Serialize)]
struct TimeoutAttributes {
	timeout: u64,
}

#[derive(Serialize)]
struct BandwidthAttributes {
	rate: u64,
}

#[derive(Clone, Copy)]
pub enum ToxiproxyDirection {
	Upstream,
	Downstream,
}

impl ToxiproxyDirection {
	fn as_str(self) -> &'static str {
		match self {
			ToxiproxyDirection::Upstream => "upstream",
			ToxiproxyDirection::Downstream => "downstream",
		}
	}
}

impl ToxiproxyTestServer {
	pub async fn start() -> Result<Self> {
		let image = GenericImage::new("ghcr.io/shopify/toxiproxy", "2.12.0")
			.with_exposed_port(ADMIN_PORT.tcp())
			.with_exposed_port(DEFAULT_PROXY_PORT.tcp())
			.with_host("host.docker.internal", Host::HostGateway);

		let container = image.start().await.context("failed to start Toxiproxy")?;
		let admin_port = container
			.get_host_port_ipv4(ADMIN_PORT.tcp())
			.await
			.context("failed to get Toxiproxy admin port")?;
		let proxy_port = container
			.get_host_port_ipv4(DEFAULT_PROXY_PORT.tcp())
			.await
			.context("failed to get Toxiproxy proxy port")?;
		let admin_base_url = format!("http://127.0.0.1:{admin_port}");
		let client = reqwest::Client::new();

		wait_for_admin(&client, &admin_base_url).await?;

		Ok(Self {
			_container: container,
			client,
			admin_base_url,
			proxy_port,
		})
	}

	pub async fn proxy(&self, name: &str, upstream: SocketAddr) -> Result<ToxiproxyProxy> {
		let request = CreateProxyRequest {
			name,
			listen: format!("0.0.0.0:{}", DEFAULT_PROXY_PORT),
			upstream: format!("host.docker.internal:{}", upstream.port()),
			enabled: true,
		};

		let response = self
			.client
			.post(format!("{}/proxies", self.admin_base_url))
			.json(&request)
			.send()
			.await
			.context("failed to create Toxiproxy proxy")?;

		if !response.status().is_success() {
			let status = response.status();
			let text = response.text().await.unwrap_or_default();
			anyhow::bail!("failed to create Toxiproxy proxy: {status}: {text}");
		}

		Ok(ToxiproxyProxy {
			client: self.client.clone(),
			admin_base_url: self.admin_base_url.clone(),
			name: name.to_string(),
			listen_addr: SocketAddr::from(([127, 0, 0, 1], self.proxy_port)),
		})
	}
}

impl ToxiproxyProxy {
	pub fn listen_addr(&self) -> SocketAddr {
		self.listen_addr
	}

	pub fn endpoint(&self) -> String {
		format!("http://{}", self.listen_addr)
	}

	pub async fn enable(&self) -> Result<()> {
		self.update_enabled(true).await
	}

	pub async fn disable(&self) -> Result<()> {
		self.update_enabled(false).await
	}

	pub async fn reset_downstream(&self) -> Result<()> {
		self.reset_peer(ToxiproxyDirection::Downstream, 0, 1.0)
			.await
	}

	pub async fn reset_peer(
		&self,
		direction: ToxiproxyDirection,
		timeout_ms: u64,
		toxicity: f32,
	) -> Result<()> {
		self.add_toxic(
			"reset-peer",
			"reset_peer",
			direction,
			toxicity,
			ResetPeerAttributes {
				timeout: timeout_ms,
			},
		)
		.await
	}

	pub async fn latency_downstream(&self, latency_ms: u64, jitter_ms: u64) -> Result<()> {
		self.add_toxic(
			"latency-downstream",
			"latency",
			ToxiproxyDirection::Downstream,
			1.0,
			LatencyAttributes {
				latency: latency_ms,
				jitter: jitter_ms,
			},
		)
		.await
	}

	pub async fn timeout_downstream(&self, timeout_ms: u64, toxicity: f32) -> Result<()> {
		self.add_toxic(
			"timeout-downstream",
			"timeout",
			ToxiproxyDirection::Downstream,
			toxicity,
			TimeoutAttributes {
				timeout: timeout_ms,
			},
		)
		.await
	}

	pub async fn timeout_upstream(&self, timeout_ms: u64, toxicity: f32) -> Result<()> {
		self.add_toxic(
			"timeout-upstream",
			"timeout",
			ToxiproxyDirection::Upstream,
			toxicity,
			TimeoutAttributes {
				timeout: timeout_ms,
			},
		)
		.await
	}

	pub async fn bandwidth_downstream(&self, kbps: u64) -> Result<()> {
		self.add_toxic(
			"bandwidth-downstream",
			"bandwidth",
			ToxiproxyDirection::Downstream,
			1.0,
			BandwidthAttributes { rate: kbps },
		)
		.await
	}

	pub async fn clear_toxics(&self) -> Result<()> {
		let response = self
			.client
			.get(format!(
				"{}/proxies/{}/toxics",
				self.admin_base_url, self.name
			))
			.send()
			.await
			.context("failed to list Toxiproxy toxics")?;

		if !response.status().is_success() {
			let status = response.status();
			let text = response.text().await.unwrap_or_default();
			anyhow::bail!("failed to list Toxiproxy toxics: {status}: {text}");
		}

		let toxics: Vec<serde_json::Value> = response
			.json()
			.await
			.context("failed to decode Toxiproxy toxics")?;

		for toxic in toxics {
			let Some(name) = toxic.get("name").and_then(|value| value.as_str()) else {
				continue;
			};
			let response = self
				.client
				.delete(format!(
					"{}/proxies/{}/toxics/{}",
					self.admin_base_url, self.name, name
				))
				.send()
				.await
				.with_context(|| format!("failed to delete Toxiproxy toxic {name}"))?;

			if !response.status().is_success() {
				let status = response.status();
				let text = response.text().await.unwrap_or_default();
				anyhow::bail!("failed to delete Toxiproxy toxic {name}: {status}: {text}");
			}
		}

		Ok(())
	}

	async fn update_enabled(&self, enabled: bool) -> Result<()> {
		let response = self
			.client
			.post(format!("{}/proxies/{}", self.admin_base_url, self.name))
			.json(&UpdateProxyRequest { enabled })
			.send()
			.await
			.context("failed to update Toxiproxy proxy")?;

		if !response.status().is_success() {
			let status = response.status();
			let text = response.text().await.unwrap_or_default();
			anyhow::bail!("failed to update Toxiproxy proxy: {status}: {text}");
		}

		Ok(())
	}

	async fn add_toxic<T>(
		&self,
		name: &str,
		toxic_type: &str,
		direction: ToxiproxyDirection,
		toxicity: f32,
		attributes: T,
	) -> Result<()>
	where
		T: Serialize,
	{
		let response = self
			.client
			.post(format!(
				"{}/proxies/{}/toxics",
				self.admin_base_url, self.name
			))
			.json(&CreateToxicRequest {
				name,
				toxic_type,
				stream: direction.as_str(),
				toxicity,
				attributes,
			})
			.send()
			.await
			.with_context(|| format!("failed to add Toxiproxy toxic {name}"))?;

		if !response.status().is_success() {
			let status = response.status();
			let text = response.text().await.unwrap_or_default();
			anyhow::bail!("failed to add Toxiproxy toxic {name}: {status}: {text}");
		}

		Ok(())
	}
}

async fn wait_for_admin(client: &reqwest::Client, admin_base_url: &str) -> Result<()> {
	let start = std::time::Instant::now();
	let timeout = std::time::Duration::from_secs(15);

	loop {
		let ready = match client.get(format!("{admin_base_url}/version")).send().await {
			Ok(response) => response.status().is_success(),
			Err(_) => false,
		};
		if ready {
			return Ok(());
		}

		if start.elapsed() > timeout {
			anyhow::bail!("timed out waiting for Toxiproxy admin API");
		}

		tokio::time::sleep(std::time::Duration::from_millis(100)).await;
	}
}
