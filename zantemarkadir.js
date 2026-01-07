const http2 = require("http2");
const tls = require("tls");
const fs = require("fs");
const path = require("path");

const C = {
  R: "\x1b[0m", B: "\x1b[1m", D: "\x1b[2m",
  r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", b: "\x1b[34m", m: "\x1b[35m", c: "\x1b[36m", w: "\x1b[37m",
  bg: "\x1b[40m"
};

const ART = [
  " █████╗ ██╗   ██╗████████╗ ██████╗ ███████╗██╗    ██╗ █████╗ ██████╗ ",
  "██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗██╔════╝██║    ██║██╔══██╗██╔══██╗",
  "███████║██║   ██║   ██║   ██║   ██║███████╗██║ █╗ ██║███████║██████╔╝",
  "██╔══██║██║   ██║   ██║   ██║   ██║╚════██║██║███╗██║██╔══██║██╔═══╝ ",
  "██║  ██║╚██████╔╝   ██║   ╚██████╔╝███████║╚███╔███╔╝██║  ██║██║     ",
  "╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝     "
];

class Core {
  static #config = (() => { try { return JSON.parse(fs.readFileSync('config.json', 'utf8')); } catch { process.exit(1); } })();
  static #state = { sessions: { main: null, mfa: null }, tokens: [null, null] };

  static get Conf() { return this.#config; }
  static get State() { return this.#state; }

  static get TLS() {
    return {
      rejectUnauthorized: false,
      secureContext: tls.createSecureContext({ secureProtocol: 'TLSv1_2_method' }),
      ALPNProtocols: ['h2']
    };
  }

  static get Headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) nosniff/1.0.9164 Chrome/124.0.6367.243 Electron/30.2.0 Safari/537.36",
      "Content-Type": "application/json",
      "X-Super-Properties": "eyJvcyI6IkFuZHJvaWQiLCJicm93c2VyIjoiQW5kcm9pZCBDaHJvbWUiLCJkZXZpY2UiOiJBbmRyb2lkIiwic3lzdGVtX2xvY2FsZSI6InRyLVRSIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDYuMDsgTmV4dXMgNSBCdWlsZC9NUkE1OE4pIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMzEuMC4wLjAgTW9iaWxlIFNhZmFyaS81MzcuMzYiLCJicm93c2VyX3ZlcnNpb24iOiIxMzEuMC4wLjAiLCJvc192ZXJzaW9uIjoiNi4wIiwicmVmZXJyZXIiOiJodHRwczovL2Rpc2NvcmQuY29tL2NoYW5uZWxzL0BtZS8xMzAzMDQ1MDIyNjQzNTIzNjU1IiwicmVmZXJyaW5nX2RvbWFpbiI6ImRpc2NvcmQuY29tIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjM1NTYyNCwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbCwiaGFzX2NsaWVudF9tb2RzIjpmYWxzZX0="
    };
  }
}

const UI = {
  w: () => process.stdout.columns || 80,
  center: (tx) => {
    const cl = tx.replace(/\x1b\[[0-9;]*m/g, "");
    const pd = Math.max(0, Math.floor((UI.w() - cl.length) / 2));
    return " ".repeat(pd) + tx;
  },
  log: (msg) => {
    let p = "";
    if (msg.includes("[+]")) p = C.c + "●  " + C.R;
    else if (msg.includes("[✓]")) p = C.g + "✔  " + C.R;
    else if (msg.includes("[✗]")) p = C.r + "✖  " + C.R;
    else if (msg.includes("[!]")) p = C.y + "⚠  " + C.R;
    else if (msg.includes("[INFO]")) p = C.b + "ℹ  " + C.R;

    const tm = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    console.log(UI.center(`${C.D}[${tm}]${C.R} ${p}${C.B}${msg.replace(/\[.*?\]/, "").trim()}${C.R}`));
  },
  banner: () => {
    console.clear();
    console.log("\n\n");
    ART.forEach(l => console.log(UI.center(C.c + l + C.R)));
    console.log("\n");
    const ln = C.D + "━".repeat(60) + C.R;
    console.log(UI.center(ln));
    console.log(UI.center(`${C.c}TARGET${C.R} : ${C.y}${Core.Conf.VANITY_URL}${C.R}`));
    console.log(UI.center(`${C.c}SERVER${C.R} : ${C.w}${Core.Conf.WATCH_ID}${C.R}`));
    console.log(UI.center(ln));
    console.log("\n");
  }
};

class Net {
  static async session(ctx = "G") {
    return new Promise(res => {
      const s = http2.connect("https://canary.discord.com", {
        settings: { enablePush: false },
        createConnection: () => tls.connect(443, 'canary.discord.com', Core.TLS)
      });
      s.on('connect', () => res(s));
      s.on('error', e => UI.log(`[✗] HTTP/2 Fail [${ctx}]: ${e.message}`));
      s.on('close', () => { });
    });
  }

  static async req(s, m, p, t, h = {}, b = null) {
    return new Promise(res => {
      if (!s || s.closed || s.destroyed) return res(null);
      try {
        const r = s.request({
          ...Core.Headers, ...h, "Authorization": t, ":method": m, ":path": p, ":authority": "canary.discord.com", ":scheme": "https"
        }, { endStream: !b });

        const c = [];
        r.on('data', d => c.push(d));
        r.on('end', () => { try { res(JSON.parse(Buffer.concat(c).toString())); } catch { res(null); } });
        r.on('error', () => res(null));
        if (b) r.write(b);
        r.end();
      } catch { res(null); }
    });
  }
}

class Overseer {
  static async mfa(idx) {
    const t = idx === 0 ? Core.Conf.CLAIM_TOKEN : Core.Conf.DELETE_TOKEN;
    const p = idx === 0 ? Core.Conf.claimerpassword : Core.Conf.deletepassword;
    let s;
    try {
      s = await Net.session(`MFA-${idx + 1}`);
      const c = await Net.req(s, "PATCH", `/api/v9/guilds/0/vanity-url`, t, {}, null);
      if (c?.code === 60003 && c?.mfa?.ticket) {
        const f = await Net.req(s, "POST", "/api/v9/mfa/finish", t, { "Content-Type": "application/json" }, JSON.stringify({ ticket: c.mfa.ticket, mfa_type: "password", data: p }));
        if (f?.token) {
          Core.State.tokens[idx] = f.token;
          return true;
        }
      }
      return false;
    } catch { return false; } finally { if (s) s.close(); }
  }

  static async arm() {
    UI.log('[+] Acquiring MFA Tokens...');
    await Promise.all([this.mfa(0), this.mfa(1)]);
    if (!Core.State.tokens[0] || !Core.State.tokens[1]) {
      if (!Core.State.tokens[0]) UI.log('[✗] MFA Missing: Claimer');
      if (!Core.State.tokens[1]) UI.log('[✗] MFA Missing: Deleter');
      UI.log('[!] Retrying in 5s...');
      return false;
    }
    UI.log('[✓] MFA Tokens acquired for both accounts');
    return true;
  }

  static async uid(t) {
    const r = await Net.req(Core.State.sessions.main, "GET", "/api/users/@me", t);
    return r?.id || null;
  }

  static async scan(t, wid) {
    try {
      const uid = await this.uid(t);
      if (!uid) return false;
      const mem = await Net.req(Core.State.sessions.main, "GET", `/api/guilds/${wid}/members/${uid}`, t);
      if (mem?.roles?.length > 0) {
        const g = await Net.req(Core.State.sessions.main, "GET", `/api/guilds/${wid}`, t);
        if (g?.roles) {
          for (const rid of mem.roles) {
            const r = g.roles.find(x => x.id === rid);
            if (r && (BigInt(r.permissions) & BigInt(0x8)) === BigInt(0x8)) {
              UI.log('[✓] Administrator permission detected!');
              return true;
            }
          }
        }
      }
      return false;
    } catch { return false; }
  }

  static async execute() {
    const h1 = { "X-Discord-MFA-Authorization": Core.State.tokens[1], "Cookie": `__Secure-recent_mfa=${Core.State.tokens[1]}` };
    const h2 = { "X-Discord-MFA-Authorization": Core.State.tokens[0], "Cookie": `__Secure-recent_mfa=${Core.State.tokens[0]}` };

    await Promise.all([
      Net.req(Core.State.sessions.main, "DELETE", `/api/invite/${Core.Conf.VANITY_URL}`, Core.Conf.DELETE_TOKEN, h1).then(r => UI.log(`[INFO] Del: ${JSON.stringify(r)}`)),
      Net.req(Core.State.sessions.main, "PATCH", `/api/guilds/${Core.Conf.SERVER_ID}/vanity-url`, Core.Conf.CLAIM_TOKEN, h2, JSON.stringify({ code: Core.Conf.VANITY_URL })).then(r => UI.log(`[INFO] Patch: ${JSON.stringify(r)}`))
    ]);
    process.exit(0);
  }

  static async watch() {
    while (true) {
      if (await this.scan(Core.Conf.CLAIM_TOKEN, Core.Conf.WATCH_ID)) {
        UI.log('[✓] Admin detected! Executing actions...');
        await this.execute();
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  static async init() {
    UI.banner();
    UI.log('[+] Starting Optimized HTTP/2 Watcher...');
    let ok = false;
    while (!ok) {
      ok = await this.arm();
      if (!ok) await new Promise(r => setTimeout(r, 5000));
    }
    Core.State.sessions.main = await Net.session("Main");
    UI.log('[✓] Main HTTP/2 Session Established');
    UI.log(`[+] Watching Guild: ${Core.Conf.WATCH_ID}`);
    UI.log('[+] Waiting for administrator permissions...');
    await this.watch();
  }
}

process.on('SIGINT', () => { if (Core.State.sessions.main) Core.State.sessions.main.close(); process.exit(0); });
process.on('uncaughtException', e => UI.log(`[✗] Fatal: ${e.message}`));

if (require.main === module) Overseer.init();
