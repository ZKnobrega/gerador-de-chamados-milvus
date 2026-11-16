# Gerador de Chamados — Milvus

Aplicação de página única que transforma o relato bruto de um atendimento de suporte N1 em um
chamado estruturado, e o abre direto no **Milvus Help Desk** pela API.

Cola-se o texto do atendimento (ou dita-se por voz); um modelo de linguagem devolve assunto,
descrição em 3ª pessoa, resolução, setor, categoria e tipo de ticket; o operador revisa e
confirma; o app cria o chamado, inicia o atendimento, registra o andamento e, opcionalmente,
finaliza.

**Um arquivo HTML. Sem build, sem `npm install`, sem servidor.** Abre com duplo clique.

---

## O problema que deu nome ao projeto

Chamado aberto pela API de integração entra no Milvus como ação da **integração**, não de uma
pessoa: o andamento aparece assinado como "Ticket" e o atendimento não conta no histórico do
operador. A documentação oficial confirma o limite — nem `/chamado/acompanhamento/criar` nem
`/chamado/finalizar` têm campo de operador, e não existe cabeçalho de impersonação.

A saída não foi contornar permissão nenhuma: foi fazer o app agir **com o login do próprio
operador**, como a página do portal faz quando ele comenta num chamado. As rotas do portal não
são documentadas, então foram lidas do bundle público dele e conferidas uma a uma:

| Ação | Rota | Autenticação |
| :--- | :--- | :--- |
| Iniciar atendimento (play) | `PUT api/chamados/playpause` | token da sessão |
| Registrar andamento | `POST api/chamadolog` | token da sessão |
| Gravar o Tipo de Ticket | `PUT api/chamados/atualizacao-massa` | token da sessão |
| Criar chamado, finalizar | API de integração documentada | token de API |

Cada etapa que passa pelo portal tem **fallback para a API de integração**: se a rota mudar, o
chamado continua sendo aberto e o app diz no resumo que aquela etapa foi gravada "como API", em
vez de alegar sucesso.

---

## O que tem dentro

**Pipeline de IA com schema estrito.** `responseSchema` com `enum` fechado para o tipo de
ticket, prompts editáveis pela interface, e um roteador (`callAi`) que cai para outros modelos e
provedores quando um responde 429/404/5xx, respeitando o tempo de espera que a própria API
informa.

**Nomes vindos da conta, não chutados.** O Milvus só aceita tipos de ticket cadastrados na conta
e recusa o resto com "Campo inválido". O app busca a lista real, usa o `id` em vez do nome e
casa a escolha ignorando acento e caixa — e, quando não há correspondência, recusa de imediato
dizendo quais são os válidos, em vez de insistir contra uma API limitada a 1 requisição por
minuto.

**Instrumentação.** Todas as chamadas ficam registradas (método, rota, status, corpo, resposta)
num diagnóstico copiável que **nunca inclui cabeçalho nenhum** — nem o token de API, nem o da
sessão. Foi o que transformou "não funciona" em causas identificáveis.

**Histórico local.** Sem limite de registros, agrupado por dia, com busca e exportação em CSV.
Quando o `localStorage` enche, descarta os mais antigos em blocos e avisa, em vez de perder a
gravação inteira.

**Testes sem framework.** `teste.js` roda o JavaScript **real** do `index.html` num DOM simulado
(`vm` do Node) e exercita as funções como a página faria — então os testes acompanham o arquivo
que vai para produção, sem cópia paralela de código.

```bash
node teste.js
```

---

## Como usar

1. Abra `index.html` no navegador.
2. Em **Configurações**, informe:
   - a chave do provedor de IA;
   - o token da API do Milvus e o cliente padrão;
   - as mesas de trabalho, unidades e categorias da sua conta (o repositório traz listas
     fictícias de exemplo).
3. Para que as interações saiam no seu nome, entre no portal pelo botão **Entrar** e, em
   Configurações, clique em **Buscar do Milvus** nos tipos de ticket.

Credenciais ficam apenas no `localStorage` do seu navegador. Nada é enviado a terceiros além do
provedor de IA escolhido e do próprio Milvus.

---

## Avisos

- As listas de unidades, categorias e mesas no repositório são **fictícias**. Substitua pelas da
  sua conta em Configurações.
- As rotas do portal não fazem parte da API documentada e podem mudar sem aviso. Por isso existe
  o fallback e o diagnóstico.
- Planos gratuitos de provedores de IA podem reter o conteúdo enviado. Confira os termos antes
  de usar com dados de pessoas.
- Projeto independente, sem vínculo com a Milvus.
