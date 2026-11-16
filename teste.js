// Testes do Gerador de Chamados.
//
// Não há build nem framework: o script roda o JavaScript REAL do index.html dentro de um
// DOM simulado (módulo `vm` do Node) e exercita as funções como a página faria. Assim os
// testes acompanham o arquivo que vai para produção, sem cópia paralela de código.
//
//   node teste.js
//
// Nada aqui toca a rede: `fetch` é substituído por respostas controladas.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ARQ = path.join(__dirname, 'index.html');
const html = fs.readFileSync(ARQ, 'utf8');

// O maior bloco <script> sem src é o código da aplicação
const blocos = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const codigo = blocos.sort((a, b) => b.length - a.length)[0];
console.log(`script da aplicacao: ${codigo.length} caracteres\n`);

// ----------------------------- DOM simulado -----------------------------
const elementos = new Map();
function novoEl(id) {
  return {
    id, value: '', innerHTML: '', textContent: '', checked: false, disabled: false,
    className: '', style: {}, children: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); }
    },
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, remove() {},
    appendChild() {}, querySelector: () => null, querySelectorAll: () => [],
    scrollIntoView() {}, setAttribute() {}, getAttribute: () => null, insertAdjacentHTML() {}
  };
}

const document = {
  getElementById(id) { if (!elementos.has(id)) elementos.set(id, novoEl(id)); return elementos.get(id); },
  createElement: () => novoEl('novo'),
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  body: novoEl('body'), documentElement: novoEl('html')
};

function memoria() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    _mapa: m
  };
}
const localStorage = memoria();
const sessionStorage = memoria();

const sandbox = {
  document, localStorage, sessionStorage, console,
  window: { onload: null, screen: { width: 1920, height: 1080 }, innerWidth: 1600, innerHeight: 900, addEventListener() {}, location: { href: '' } },
  navigator: { userAgent: 'node', clipboard: { writeText: async () => {} } },
  fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }),
  setTimeout, clearTimeout, setInterval, clearInterval,
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  Blob: class { constructor(p) { this.parts = p; } },
  confirm: () => true, alert: () => {}, prompt: () => null
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
Object.assign(sandbox.window, { document, localStorage });

const ctx = vm.createContext(sandbox);
vm.runInContext(codigo, ctx, { filename: 'index.html' });
console.log('script carregou sem erro em runtime\n');

const run = (expr) => vm.runInContext(expr, ctx);
run('showToast = function(){};'); // depende do container de avisos do HTML real

// ----------------------------- verificações -----------------------------
let falhas = 0;
function ok(nome, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FALHA'}  ${nome}${extra ? '  ->  ' + extra : ''}`);
  if (!cond) falhas++;
}

// ============================ HISTÓRICO ============================
ok('registro antigo "09/11, 14:30" ganha data', run(`historyTimestamp({ time: '09/11, 14:30' })`) > 0);
ok('data sem ano no futuro cai no ano anterior',
  run(`historyTimestamp({ time: '31/12, 23:59' })`) <= Date.now() + 86400000);
ok('registro novo usa o proprio ts', run(`historyTimestamp({ ts: 1700000000000 })`) === 1700000000000);
ok('rotulo de hoje', run(`historyDiaRotulo(historyDiaChave(Date.now()))`) === 'Hoje');
ok('rotulo de ontem', run(`historyDiaRotulo(historyDiaChave(Date.now() - 86400000))`) === 'Ontem');
ok('rotulo antigo traz data e dia da semana', /04\/03\/2026 · \w+/.test(run(`historyDiaRotulo('2026-03-04')`)));

const DIAS = 7, POR_DIA = 12;
run(`
  ticketHistory = [];
  for (let d = 0; d < ${DIAS}; d++)
    for (let i = 0; i < ${POR_DIA}; i++)
      ticketHistory.push({
        title: '[Desktop] Chamado dia ' + d + ' n' + i,
        ts: Date.now() - d * 86400000 - i * 600000,
        content: 'corpo ' + d + '-' + i,
        milvusId: String(13000 + d * 100 + i)
      });
  normalizeHistory();
`);
ok(`guarda ${DIAS * POR_DIA} registros (antes o teto era 20)`, run(`ticketHistory.length`) === DIAS * POR_DIA);
ok('ordenado do mais recente para o mais antigo',
  run(`ticketHistory.every((it, i, a) => i === 0 || a[i-1].ts >= it.ts)`));

run(`renderHistory()`);
const lista = elementos.get('historyList').innerHTML;
ok(`a gaveta mostra ${DIAS} cabecalhos de dia`,
  (lista.match(/text-\[11px\] font-bold text-indigo-300/g) || []).length === DIAS);
ok(`a gaveta mostra os ${DIAS * POR_DIA} cartoes`, (lista.match(/>CHAMADO</g) || []).length === DIAS * POR_DIA);
ok('cada dia mostra a contagem', lista.includes(`${POR_DIA} chamados`));
ok('resumo com total e dias', /84 chamados · 7 dias/.test(elementos.get('historyResumo').textContent));

run(`setHistoryFiltroDia('${run(`historyDiaChave(Date.now() - 86400000)`)}')`);
ok('filtrar por um dia mostra so aquele dia',
  (elementos.get('historyList').innerHTML.match(/>CHAMADO</g) || []).length === POR_DIA);
run(`setHistoryFiltroDia('')`);

run(`setHistoryFiltroTexto('dia 3 n4')`);
ok('busca por assunto filtra', (elementos.get('historyList').innerHTML.match(/>CHAMADO</g) || []).length === 1);
run(`setHistoryFiltroTexto('13204')`);
ok('busca pelo numero do ticket filtra', (elementos.get('historyList').innerHTML.match(/>CHAMADO</g) || []).length === 1);
run(`setHistoryFiltroTexto('')`);

run(`persistHistory()`);
ok('persistiu todos os registros', JSON.parse(localStorage.getItem('pro_ticket_history_v3')).length === DIAS * POR_DIA);

let baixado = null;
document.createElement = () => { baixado = novoEl('a'); return baixado; };
run(`exportHistoryCsv()`);
ok('exportar gera arquivo .csv', !!baixado && /^historico-chamados-\d{4}-\d{2}-\d{2}\.csv$/.test(baixado.download));

// ===================== ROTA E CORPO DO ANDAMENTO =====================
ok('rota de fabrica do andamento e POST /api/chamadolog',
  run(`getPortalAction('acompanhamento').rota`) === 'POST /api/chamadolog');
const corpoLog = run(`renderPortalBody(getPortalAction('acompanhamento').corpo, { internalId: 98765, codigo: '17001', texto: 'Linha 1\\nLinha 2 com <tag> e "aspas"', privado: false })`);
ok('corpo no formato que o portal envia',
  corpoLog.chamadoLog && corpoLog.chamadoLog.chamado_id === 98765
  && corpoLog.chamadoLog.log_tipo_id === 1 && corpoLog.chamadoLog.origem_listagem === false);
ok('observacao_html escapa tags e vira <br>',
  corpoLog.chamadoLog.observacao_html.includes('&lt;tag&gt;') && corpoLog.chamadoLog.observacao_html.includes('<br>'));
ok('observacao mantem o texto puro', corpoLog.chamadoLog.observacao.includes('<tag>'));
ok('gravar no meu nome vem ligado por padrao', run(`portalActionsEnabled()`) === true);

// Rota salva por versao anterior nao pode continuar valendo
run(`localStorage.setItem('milvus_portal_actions', JSON.stringify({ acompanhamento: { rota: 'POST /api/rota/velha', corpo: '{}' } }))`);
ok('rota salva sem versao e descartada', run(`getPortalAction('acompanhamento').rota`) === 'POST /api/chamadolog');
run(`localStorage.setItem('milvus_portal_actions', JSON.stringify({ versao: 'antiga', acompanhamento: { rota: 'POST /api/rota/velha', corpo: '{}' } }))`);
ok('rota de versao antiga e descartada', run(`getPortalAction('acompanhamento').rota`) === 'POST /api/chamadolog');
run(`savePortalAction('acompanhamento', 'POST /api/minha/rota', '{"x":1}')`);
ok('rota salva na versao atual continua valendo', run(`getPortalAction('acompanhamento').rota`) === 'POST /api/minha/rota');
run(`localStorage.removeItem('milvus_portal_actions')`);

// ===================== TIPOS DE TICKET =====================
ok('sem lista buscada, usa os tipos padrao', run(`tiposChamadoParaIA().length`) === 5);
run(`localStorage.setItem('milvus_tipos_chamado', JSON.stringify([
  { id: 10, text: 'Dúvida' }, { id: 11, text: 'INCIDENTE' }, { id: 12, text: 'Requisição / Solicitação' }
]))`);
ok('com lista buscada, a IA so escolhe tipos reais',
  JSON.stringify(run(`tiposChamadoParaIA()`)) === JSON.stringify(['Dúvida', 'INCIDENTE', 'Requisição / Solicitação']));
ok('"Incidente" casa com "INCIDENTE" da conta', run(`resolverTipoChamado('Incidente').texto`) === 'INCIDENTE');
ok('"Requisiçáo/Solicitaçáo" casa com "Requisição / Solicitação"',
  run(`resolverTipoChamado('Requisiçáo/Solicitaçáo').texto`) === 'Requisição / Solicitação');
ok('"Duvida" sem acento casa com "Dúvida"', run(`resolverTipoChamado('Duvida').texto`) === 'Dúvida');
ok('tipo inexistente devolve null', run(`resolverTipoChamado('Mudança')`) === null);

// ===================== TRAVAS ANTES DE SAIR DA MÁQUINA =====================
const chain = [];
chain.push(() => {
  run(`localStorage.setItem('milvus_portal_actions_enabled', 'false')`);
  return run(`(async () => await runPortalAction('acompanhamento', { internalId: 1, codigo: '1', texto: 'x' }))()`)
    .then(r => ok('desligado nas Configuracoes, nada e enviado', r.success === false && /desligado/.test(r.error)));
});
chain.push(() => {
  run(`localStorage.setItem('milvus_portal_actions_enabled', 'true')`);
  run(`localStorage.removeItem('milvus_portal_session')`);
  return run(`(async () => await runPortalAction('acompanhamento', { internalId: 1, codigo: '1', texto: 'x' }))()`)
    .then(r => ok('sem sessao do portal, nao envia e explica', r.success === false && /sessão do portal/.test(r.error)));
});
chain.push(() => {
  run(`localStorage.setItem('milvus_portal_session', JSON.stringify({ token: 'TK-SECRETO', sessao: 'SESSAO-X', nome: 'Operador', expira: Date.now() + 3600000 }))`);
  run(`savePortalAction('acompanhamento', 'caminho-sem-metodo', '{}')`);
  return run(`(async () => await runPortalAction('acompanhamento', { internalId: 1, codigo: '1', texto: 'x' }))()`)
    .then(r => ok('rota mal escrita e recusada antes de sair da maquina', r.success === false && /rota inválida/.test(r.error)));
});
chain.push(() => {
  run(`savePortalAction('acompanhamento', 'POST /api/chamadolog', '{ isso nao e json }')`);
  return run(`(async () => await runPortalAction('acompanhamento', { internalId: 1, codigo: '1', texto: 'x' }))()`)
    .then(r => ok('modelo de corpo invalido e recusado com motivo', r.success === false && /JSON/.test(r.error)));
});

// ===================== AUTENTICAÇÃO =====================
// A API recusa token e authorization juntos: "Ambos os tokens não podem estar preenchidos".
let enviados = [];
chain.push(() => {
  run(`localStorage.removeItem('milvus_portal_actions')`);
  enviados = [];
  sandbox.fetch = async (url, opts) => { enviados.push(opts.headers); return { ok: true, status: 200, text: async () => '{"status_code":200}' }; };
  run(`limparDiagnostico()`);
  return run(`(async () => await callPortal('POST', '/api/chamadolog', { a: 1 }))()`).then(res => {
    ok('a chamada funciona na primeira tentativa', res.ok === true);
    ok('so uma tentativa quando funciona', enviados.length === 1);
    ok('usa o header token (o mesmo do play)', enviados[0].token === 'TK-SECRETO');
    ok('NUNCA manda token e authorization juntos', enviados.every(h => !(h.token && h.authorization)));
    ok('manda o session quando o login devolveu', enviados[0].session === 'SESSAO-X');
    ok('o diagnostico registra a chamada', run(`diagnostico.length`) === 1);
    ok('o diagnostico NUNCA inclui o token nem a sessao', !/TK-SECRETO|SESSAO-X/.test(run(`textoDiagnostico()`)));
  });
});
chain.push(() => {
  enviados = [];
  sandbox.fetch = async (url, opts) => { enviados.push(opts.headers); return { ok: false, status: 401, text: async () => '{"error_code":401}' }; };
  return run(`(async () => await callPortal('POST', '/api/chamadolog', { a: 1 }))()`).then(() => {
    ok('em 401, tenta o segundo esquema de auth', enviados.length === 2);
    ok('a segunda tentativa usa authorization sozinho', enviados[1].authorization === 'TK-SECRETO' && !enviados[1].token);
  });
});
chain.push(() => {
  enviados = [];
  run(`localStorage.setItem('milvus_portal_session', JSON.stringify({ token: 'TK2', nome: 'Operador', expira: Date.now() + 3600000 }))`);
  sandbox.fetch = async (url, opts) => { enviados.push(opts.headers); return { ok: false, status: 404, text: async () => '"URL nao encontrada"' }; };
  return run(`(async () => await callPortal('POST', '/api/rota/inexistente', { a: 1 }))()`).then(res => {
    ok('404 nao repete a chamada com outro header', enviados.length === 1);
    ok('o erro do 404 chega a quem chamou', res.ok === false && /encontrada/.test(res.error));
  });
});
chain.push(() => {
  sandbox.fetch = async () => { throw new Error('Failed to fetch'); };
  run(`limparDiagnostico()`);
  return run(`(async () => await callPortal('POST', '/api/chamadolog', { a: 1 }))()`).then(r => {
    ok('falha de rede/CORS e reportada com motivo', r.ok === false && /CORS|rede/.test(r.error));
    ok('a falha de rede entra no diagnostico', /falha de rede/.test(run(`textoDiagnostico()`)));
  });
});

// ===================== TIPO DE TICKET PELO PORTAL =====================
chain.push(() => {
  const pedidos = [];
  run(`localStorage.setItem('milvus_portal_session', JSON.stringify({ token: 'TK', nome: 'Operador', expira: Date.now() + 3600000 }))`);
  run(`localStorage.setItem('milvus_portal_actions_enabled', 'true')`);
  run(`localStorage.removeItem('milvus_campo_tipo_id')`);
  run(`localStorage.setItem('milvus_tipos_chamado', JSON.stringify([{ id: 3, text: 'Incidente' }, { id: 9, text: 'Dúvida' }]))`);
  sandbox.fetch = async (url, opts) => {
    pedidos.push({ url, metodo: opts.method, corpo: opts.body ? JSON.parse(opts.body) : null });
    const r = (txt) => ({ ok: true, status: 200, text: async () => txt });
    if (url.includes('atualizacao-massa/dropdown')) return r('{"dropDown":[{"id":12,"chave":"@MesaTrabalho"},{"id":77,"chave":"@TipoChamado"}]}');
    if (url.includes('atualizacao-massa')) return r('{"status_code":200}');
    if (url.includes('/chamado/listagem')) return r('{"lista":[{"codigo":"17001","id":39500001,"tipo_chamado":{"id":3,"text":"Incidente"}}]}');
    return r('{}');
  };
  return run(`(async () => await updateMilvusTicketTipo('https://apix', 'tok', '17001', 39500001, 'Incidente', 'Central de TI'))()`).then(r => {
    ok('o tipo e gravado pelo portal, no nome do operador', r.success === true && r.via === 'portal');
    const massa = pedidos.find(p => p.url.includes('atualizacao-massa') && !p.url.includes('dropdown'));
    ok('usa o campo @TipoChamado descoberto no dropdown', massa && massa.corpo.valores.campo_id === 77);
    ok('manda o ID do tipo e o ID interno do chamado',
      massa && massa.corpo.valores.valor === 3 && massa.corpo.chamados[0] === 39500001);
    ok('payload minimo: so chamados e valores', massa && JSON.stringify(Object.keys(massa.corpo)) === '["chamados","valores"]');
    ok('nao cai na API de integracao quando o portal resolve', !pedidos.some(p => p.url.includes('/chamado/atualizar')));
    ok('gasta poucas requisicoes (antes eram ate 42)', pedidos.length <= 4, pedidos.length + ' requisicoes');
    ok('o id do campo fica guardado para a proxima vez', localStorage.getItem('milvus_campo_tipo_id') === '77');
  });
});
chain.push(() => {
  const pedidos = [];
  sandbox.fetch = async (url) => {
    pedidos.push(url);
    const r = (txt) => ({ ok: true, status: 200, text: async () => txt });
    if (url.includes('/chamado/listagem')) return r('{"lista":[{"codigo":"17001","id":1,"tipo_chamado":{"id":null,"text":"Não possui"}}]}');
    if (url.includes('/chamado/atualizar')) return r('"Chamado(s) atualizado(s) com sucesso!"');
    return r('{}');
  };
  return run(`(async () => await updateMilvusTicketTipo('https://apix', 'tok', '17001', 1, 'Incidente', ''))()`).then(r => {
    ok('"aceitou mas nao aplicou" e reportado como falha', r.success === false);
    ok('o erro explica que o tipo nao aparece no chamado', /não aparece no chamado/.test(r.error));
    const tentativas = pedidos.filter(u => u.includes('/chamado/atualizar')).length;
    ok('no maximo 3 tentativas na API de integracao', tentativas <= 3, tentativas + ' tentativas');
    const listagens = pedidos.filter(u => u.includes('/chamado/listagem')).length;
    ok('uma confirmacao por tentativa (antes eram duas)', listagens === tentativas + 1);
  });
});
chain.push(() => {
  run(`localStorage.removeItem('milvus_portal_session')`);
  run(`localStorage.removeItem('milvus_tipos_chamado')`);
  return run(`garantirTiposChamado()`).then(v => ok('sem sessao do portal, garantirTiposChamado devolve false', v === false));
});

chain.reduce((p, f) => p.then(f), Promise.resolve()).then(() => {
  console.log(`\n${falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' TESTE(S) FALHARAM'}`);
  process.exit(falhas === 0 ? 0 : 1);
}).catch(e => {
  console.error('\nERRO NO TESTE:', e);
  process.exit(1);
});
