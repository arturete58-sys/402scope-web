// Live onchain feed: reads the 402Scope Trust contracts' events on Stellar
// testnet straight from a public Stellar RPC (getEvents), in the browser.
// The contract IDs come from the latest run of the open testnet workflow.
'use strict';
(() => {
  const LATEST = 'https://raw.githubusercontent.com/arturete58-sys/402scope-trust/main/docs/testnet/latest.json';
  const RPC = 'https://soroban-testnet.stellar.org';
  const EXPERT = 'https://stellar.expert/explorer/testnet';
  const UNIT = 10_000_000; // SCOPE has 7 decimals, like every Stellar asset

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const short = (a) => (a && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
  const amount = (v) => {
    const n = Number(typeof v === 'object' && v !== null && 'amount' in v ? v.amount : v) / UNIT;
    return `${n.toLocaleString('en', { maximumFractionDigits: 7 })} SCOPE`;
  };
  const when = (iso) => {
    const d = new Date(iso);
    const s = (Date.now() - d) / 1000;
    const rel = s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 172800 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
    return `<span title="${esc(d.toISOString())}">${rel}</span>`;
  };
  const human = (s) => String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  let names = {}; // address -> readable label
  const who = (a) => {
    if (typeof a !== 'string') return esc(String(a));
    const kind = a.startsWith('C') ? 'contract' : 'account';
    const label = names[a] ? esc(names[a]) : `<span class="mono">${esc(short(a))}</span>`;
    return `<a href="${EXPERT}/${kind}/${a}" target="_blank" rel="noopener" title="${esc(a)}">${label}</a>`;
  };

  const CONTRACTS = [
    ['registry', 'Attestation registry', 'Attester bonds, signed scores per endpoint and per seller, evidence roots'],
    ['policy', 'Trust policy', 'OpenZeppelin smart-account policy: pay only sellers the chosen attesters trust'],
    ['spendingLimit', 'Spending limit', 'Smart-account policy: at most an amount in any rolling window'],
    ['wallet', 'Agent wallet', 'Smart account with the trust policy'],
    ['budgetWallet', 'Budgeted agent wallet', 'Smart account with the trust policy and a daily spending limit'],
    ['verifier', 'Ed25519 verifier', 'Checks the agent key’s signatures for both wallets'],
    ['webauthnVerifier', 'Passkey verifier', 'Checks the owner’s passkey (WebAuthn) signatures'],
    ['escrow', 'Escrow', 'x402 scheme escrow: payments held until delivery is shown, settled in seconds. No admin'],
    ['refundBond', 'Refund bond', 'Optional seller bonds; refunds payers when a seller\u2019s signed receipt shows a breach. No admin'],
    ['token', 'SCOPE test token', 'SEP-41 token the demo pays and bonds in'],
  ];
  const ACCOUNTS = {
    sellerGood: 'good seller', sellerBad: 'bad seller', sellerStale: 'stale seller', attester1: 'attester 1', attester2: 'attester 2',
    buyer1: 'buyer 1', buyer2: 'buyer 2', facilitator: 'facilitator', admin: 'deployer', issuer: 'SCOPE issuer',
  };

  // One event -> [kind, title, description]
  function describe(t, v) {
    const [a, b] = t;
    if (a === 'scope') {
      if (b === 'registered') return ['bond', 'Attester bonded', `${who(t[2])} locked ${amount(v.bond)} as its bond`];
      if (b === 'seller') return ['score', 'Seller scored', `${who(t[2])} scored ${who(t[3])}: <strong>${esc(v.score)}</strong>/100`];
      if (b === 'attest') return ['score', 'Endpoint scored', `${who(t[2])} scored an endpoint: <strong>${esc(v.score)}</strong>/100`];
      if (b === 'slashed') return ['bond', 'Attester slashed', `${who(t[2])} lost ${amount(v.amount)}`];
      if (b === 'unbonding') return ['bond', 'Unbonding', `${who(t[2])} started to withdraw its bond`];
      if (b === 'withdrawn') return ['bond', 'Bond withdrawn', `${who(t[2])} withdrew ${amount(v.amount)}`];
    }
    if (a === 'scope_policy') {
      if (b === 'installed') return ['policy', 'Trust policy set', `${who(t[2])}: score ≥ ${esc(v.params?.min_score)} from ${esc(v.params?.quorum)} of ${esc(v.params?.attesters?.length)} attesters`];
      if (b === 'uninstalled') return ['policy', 'Trust policy removed', `${who(t[2])}`];
    }
    if (a === 'scope_limit') {
      if (b === 'installed') return ['policy', 'Budget set', `${who(t[2])}: at most ${amount(v.spending_limit)} per ${Number(v.period_ledgers).toLocaleString('en')} ledgers (about ${Math.round(v.period_ledgers / 720)} h)`];
      if (b === 'changed') return ['policy', 'Budget changed', `${who(t[2])}: at most ${amount(v.spending_limit)} now, signed by the owner`];
      if (b === 'uninstalled') return ['policy', 'Budget removed', `${who(t[2])}`];
    }
    if (a === 'scope_bond') {
      if (b === 'deposit') return ['bond', 'Refund bond', `a seller backs its terms: ${amount(v.balance)} in bond`];
      if (b === 'refund') return ['payment', 'Refunded', `${who(t[3])} refunded ${amount(v.amount)}: the seller\u2019s own receipt showed it broke its terms`];
      if (b === 'unlock') return ['bond', 'Bond withdrawal requested', `${amount(v.amount)}, after the notice period`];
      if (b === 'withdraw') return ['bond', 'Bond withdrawn', `${amount(v.amount)}`];
    }
    if (a === 'scope_escrow') {
      if (b === 'paid') return ['payment', 'Paid into escrow', `${who(v.payer)} → held for ${who(v.seller)} · ${amount(v.amount)}`];
      if (b === 'released') return ['payment', 'Escrow released', `${who(v.seller)} paid ${amount(v.amount)} · ${['the buyer confirmed', 'bonded seller', 'after the contest window'][v.how] ?? ''}`];
      if (b === 'refunded') return ['payment', 'Escrow refunded', `${who(v.payer)} refunded ${amount(v.amount)} · ${['the seller\u2019s receipt showed a breach', 'no receipt by the deadline'][v.why] ?? ''}`];
      if (b === 'delivered') return ['policy', 'Receipt posted', 'released after the contest window unless contested'];
    }
    if (a === 'transfer') return ['payment', 'Payment', `${who(t[1])} → ${who(t[2])} · ${amount(v)}`];
    if (a === 'mint') return ['setup', 'Funded', `${who(t.length > 3 ? t[2] : t[1])} · ${amount(v)}`];
    if (a === 'spending_limit_enforced') return ['policy', 'Within budget', `${who(t[1])} paid ${amount(v.amount)}; ${amount(v.total_spent_in_period)} spent in the window`];
    if (a === 'spending_limit_installed') return ['policy', 'Budget set', `${who(t[1])}: at most ${amount(v.spending_limit)} per ${Number(v.period_ledgers).toLocaleString('en')} ledgers (about ${Math.round(v.period_ledgers / 720)} h)`];
    if (a === 'spending_limit_changed') return ['policy', 'Budget changed', `${who(t[1])}: ${amount(v.spending_limit)}`];
    const rest = t.slice(1).filter((x) => typeof x === 'string').map(who).join(' · ');
    return ['setup', human(a), rest];
  }

  const KIND_LABEL = { payment: 'payment', score: 'score', bond: 'bond', policy: 'policy', setup: 'setup' };
  const inFilter = (r) => filter === 'all' || r.kind === filter || (filter === 'policy' && r.kind === 'setup');
  let rows = [];
  let filter = 'all';

  function render() {
    const shown = rows.filter(inFilter);
    $('feedBody').innerHTML = shown.map((r) => `<tr>
      <td class="st">${when(r.at)}</td>
      <td><span class="kind kind-${r.kind}">${esc(KIND_LABEL[r.kind])}</span> ${esc(r.title)}</td>
      <td>${r.text}</td>
      <td>${who(r.contract)}</td>
      <td class="st"><a href="${EXPERT}/tx/${r.tx}" target="_blank" rel="noopener">${esc(r.tx.slice(0, 8))}…</a></td>
    </tr>`).join('') || `<tr><td colspan="5" class="muted">No events of this kind.</td></tr>`;
    const count = (k) => rows.filter((r) => r.kind === k).length;
    $('stats').innerHTML = [['payment', 'payments settled'], ['score', 'scores written'], ['bond', 'bond events'], ['policy', 'policy and budget events']]
      .map(([k, l]) => `<div class="live-stat"><span class="live-num">${count(k)}</span><span class="muted">${l}</span></div>`).join('');
    $('stats').hidden = false;
    $('filters').hidden = false;
    $('feedWrap').hidden = false;
  }

  async function events(latest) {
    const sdk = window.StellarSdk;
    if (!sdk) throw new Error('the Stellar SDK did not load');
    const server = new sdk.rpc.Server(RPC);
    const health = await server.getHealth();
    const c = latest.contracts || {};
    const ours = ['registry', 'policy', 'spendingLimit', 'refundBond', 'escrow'].map((k) => c[k]).filter(Boolean);
    const filters = [{ type: 'contract', contractIds: ours.slice(0, 5) }];
    if (c.token) filters.push({ type: 'contract', contractIds: [c.token] });
    // Start shortly before the run (ledgers close every ~5-6 s; 5 s errs on the early side),
    // since the RPC scans a limited range of ledgers per request.
    const since = latest.startedAt ? (Date.now() - new Date(latest.startedAt)) / 1000 : Infinity;
    const start = Math.max(health.oldestLedger, health.latestLedger - Math.ceil(since / 5) - 720);
    const out = [];
    let req = { startLedger: start, filters, limit: 200 };
    let seen = false;
    for (let page = 0; page < 40; page++) {
      const res = await server.getEvents(req);
      for (const ev of res.events) {
        let t, v;
        try {
          t = ev.topic.map((x) => sdk.scValToNative(x));
          v = sdk.scValToNative(ev.value);
        } catch { continue; }
        const [kind, title, text] = describe(t, v);
        out.push({ kind, title, text, at: ev.ledgerClosedAt, ledger: ev.ledger, tx: ev.txHash, contract: String(ev.contractId?.contractId?.() ?? ev.contractId), id: ev.id });
      }
      if (res.events.length) seen = true;
      else if (seen) break; // past the run
      if (!res.cursor || res.cursor === req.cursor) break;
      req = { filters, limit: 200, cursor: res.cursor };
    }
    return { out, health };
  }

  function contractsTable(c) {
    $('contractsBody').innerHTML = CONTRACTS.filter(([k]) => c[k]).map(([k, name, what]) => `<tr>
      <td>${esc(name)}</td><td>${esc(what)}</td>
      <td class="st"><a href="${EXPERT}/contract/${c[k]}" target="_blank" rel="noopener" title="${esc(c[k])}">${esc(short(c[k]))}</a></td></tr>`).join('');
  }

  function refusals(latest) {
    const list = [
      ...(latest.walletPayments || []).map((p) => ['Agent wallet', p]),
      ...((latest.budgetWallet && latest.budgetWallet.payments) || []).map((p) => ['Budgeted wallet', p]),
    ].filter(([, p]) => String(p.outcome).startsWith('refused'));
    if (!list.length) { $('refusedNote').textContent = 'No refusals in the latest run.'; return; }
    const why = (p) => {
      const o = String(p.outcome);
      if (/spending limit/.test(o)) return 'Over its daily budget (spending limit)';
      if (/not trusted|policy/.test(o)) return 'Seller not trusted by the attester quorum (trust policy)';
      return o;
    };
    $('refusedBody').innerHTML = list.map(([w, p]) => `<tr><td>${esc(w)}</td><td class="ep">${esc(p.endpoint)}</td><td>${esc(why(p))}</td></tr>`).join('');
    $('refusedWrap').hidden = false;
  }

  async function load() {
    let latest;
    try {
      const r = await fetch(LATEST, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      latest = await r.json();
    } catch (e) {
      $('runLine').className = 'err';
      $('runLine').textContent = `Could not load the latest run (${e.message}).`;
      return;
    }
    const c = latest.contracts || {};
    names = {};
    for (const [k, label] of Object.entries(ACCOUNTS)) if (latest.accounts?.[k]) names[latest.accounts[k]] = label;
    for (const [k, label] of CONTRACTS) if (c[k]) names[c[k]] = label.toLowerCase().replace(/^scope/, 'SCOPE');
    contractsTable(c);
    refusals(latest);
    const fin = latest.finishedAt ? new Date(latest.finishedAt) : null;
    $('runLine').className = '';
    $('runLine').innerHTML = `Latest run finished ${fin ? when(fin.toISOString()) : '—'}. <a href="https://github.com/arturete58-sys/402scope-trust/actions/workflows/testnet-demo.yml" target="_blank" rel="noopener">The workflow</a> and <a href="https://github.com/arturete58-sys/402scope-trust/blob/main/docs/testnet/README.md" target="_blank" rel="noopener">its report</a> are public.`;
    try {
      const { out, health } = await events(latest);
      rows = out.reverse();
      $('rpcLine').innerHTML = `Read from <span class="mono">${esc(RPC.replace('https://', ''))}</span> at ledger ${Number(health.latestLedger).toLocaleString('en')}. The RPC keeps recent ledgers only (from ${Number(health.oldestLedger).toLocaleString('en')}).`;
      if (rows.length) {
        render();
        $('feedNote').textContent = 'Newest first. Every row links to its transaction on Stellar Expert.';
      } else {
        $('feedNote').textContent = 'The RPC holds no events for these contracts right now: the latest run is older than the ledgers it keeps. The next daily run brings them back; the run’s report has every transaction in the meantime.';
      }
    } catch (e) {
      $('rpcLine').className = 'err';
      $('rpcLine').textContent = `The public RPC did not answer (${e.message}). The run’s report lists every transaction.`;
    }
  }

  $('filters').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-kind]');
    if (b) {
      filter = b.dataset.kind;
      for (const x of $('filters').querySelectorAll('[data-kind]')) x.classList.toggle('is-on', x === b);
      render();
    }
    if (ev.target.id === 'refresh') load();
  });
  load();
})();
