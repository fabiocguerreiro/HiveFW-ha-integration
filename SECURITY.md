# Security Policy

## Versões suportadas

HiveFW é uma integração custom para Home Assistant. Correções de segurança são aplicadas à versão mais recente.

| Versão | Suporte |
| --- | --- |
| Mais recente | Sim |
| Versões anteriores | Não garantido |

## Reportar uma vulnerabilidade

Não abras um issue público para uma vulnerabilidade.

Usa **GitHub → Security → Report a vulnerability** e inclui:

- versão/commit afetado;
- impacto;
- passos de reprodução;
- logs ou payloads relevantes, removendo segredos.

O objetivo é confirmar o problema e coordenar uma correção antes de divulgação pública.

## Modelo de confiança

HiveFW recebe dados provenientes de uma rede mesh. Nomes de nós, mensagens, canais,
paths e outros campos recebidos por rádio devem ser tratados como **dados não confiáveis**.

### Renderização

O frontend usa Lit e DOM APIs. Dados provenientes da mesh são inseridos através de
interpolação escapada ou `textContent`. Onde existe markup estático criado por JavaScript,
esse markup não é construído a partir de valores recebidos da mesh.

### WebSocket e permissões

Comandos WebSocket que alteram configuração, identidade, contactos, canais, rádio,
Repeaters remotos ou executam comandos administrativos exigem utilizador administrador
do Home Assistant.

Operações de leitura e estado podem estar disponíveis a utilizadores autenticados,
de acordo com o modelo de permissões do Home Assistant.

### Validação

Os comandos WebSocket declaram schemas de entrada. Payloads inválidos são rejeitados
antes de chegar à lógica do rádio.

### Persistência

Histórico de mensagens, unread cursors e estado auxiliar usam as convenções de storage
do Home Assistant. Dados persistidos são validados ao carregar e erros de escrita não
devem provocar substituição silenciosa por estruturas vazias.

### Segredos

Passwords, chaves e identidade do rádio não devem ser expostos em payloads frontend,
logs ou mensagens de erro além do estritamente necessário.

## Fora do âmbito

- vulnerabilidades do Home Assistant Core;
- vulnerabilidades do sistema operativo/host;
- vulnerabilidades do protocolo MeshCore ou do firmware que não sejam introduzidas por HiveFW;
- comportamento de hardware/radiofrequência que não atravesse a fronteira de segurança da integração.

## Dependências e upstream

HiveFW inclui/adapta componentes de `meshcore-dev/meshcore-ha` e usa o SDK MeshCore.
A proveniência e os avisos de licença upstream estão consolidados em [LICENSE](LICENSE).
