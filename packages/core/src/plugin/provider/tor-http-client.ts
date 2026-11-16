// Tor HTTP client: routes global fetch (undici) through a SOCKS5 proxy.
// Imported for its side effect by the opencode provider, which re-applies the same dispatcher
// once it has read the proxy from the environment.
import { SocksProxyAgent } from "socks-proxy-agent"
import { ProxyAgent, setGlobalDispatcher } from "undici"

const torProxy = process.env.TOR_SOCKS5_PROXY ?? "socks5://127.0.0.1:9050"

setGlobalDispatcher(new ProxyAgent(torProxy))

// Node's native http/https modules read this agent.
globalThis.__TOR_SOCKS_AGENT__ = new SocksProxyAgent(torProxy)

declare global {
  var __TOR_SOCKS_AGENT__: SocksProxyAgent | undefined
}

export {}
