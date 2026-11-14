// Tor HTTP client - provides HttpClient layer with SOCKS5 proxy dispatcher
// This replaces the default FetchHttpClient layer with one that routes through Tor

import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { SocksProxyAgent } from "socks-proxy-agent"
import { ProxyAgent, setGlobalDispatcher } from "undici"

export const TorHttpClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const torProxy = process.env.TOR_SOCKS5_PROXY ?? "socks5://127.0.0.1:9050"
    
    // Create SOCKS5 proxy agent for undici
    const proxyAgent = new ProxyAgent(torProxy)
    setGlobalDispatcher(proxyAgent)
    
    // Also create Node.js agent for native http/https
    const socksAgent = new SocksProxyAgent(torProxy)
    
    // Provide custom FetchHttpClient with SOCKS5 proxy dispatcher
    const client = yield* FetchHttpClient.layer.pipe(
      Effect.provideService(FetchHttpClient.Fetch, (input: RequestInfo | URL, init?: RequestInit) => {
        return proxyAgent.fetch(input instanceof Request ? input.url : input.toString(), init)
      }),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
    )
    
    // Store socksAgent for native http/https modules
    globalThis.__TOR_SOCKS_AGENT__ = socksAgent
    
    console.log(`[TorHttpClient] Configured SOCKS5 proxy: ${torProxy}`)
    return client
  })
)

// Extend globalThis for TypeScript
declare global {
  var __TOR_SOCKS_AGENT__: ReturnType<typeof SocksProxyAgent> | undefined
}

export {}