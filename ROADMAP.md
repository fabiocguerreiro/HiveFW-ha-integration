# HiveFW Home Assistant Roadmap

Este ficheiro é a fonte de verdade para desenvolvimento futuro da integração standalone **HiveFW**.

## Objetivo

Uma única integração Home Assistant:

- HiveFW possui a ligação TCP/Wi-Fi, BLE ou USB ao rádio;
- não é necessária uma instalação separada de `meshcore-ha`;
- entidades, serviços, eventos, config flow, storage, WebSocket API e frontend pertencem ao HiveFW;
- MeshCore permanece como protocolo/SDK e como origem devidamente atribuída de partes do engine;
- funcionalidades que geram RF devem ser on-demand sempre que possível.

## Base standalone — concluída

- [x] Branch de rollback `main-stable` criada antes da consolidação.
- [x] Engine MeshCore HA adaptado e incorporado em `hivefw_integration.engine`.
- [x] Proveniência upstream e commit base documentados.
- [x] Runtime requirements geridos pelo próprio HiveFW.
- [x] Config flow HiveFW configura TCP/Wi-Fi, BLE ou USB diretamente.
- [x] HiveFW inicia e termina o coordinator/engine.
- [x] Plataformas HA expostas pelo domínio HiveFW: sensor, binary_sensor, device_tracker, button, select e text.
- [x] Serviços públicos em `hivefw_integration.*`.
- [x] Entidades públicas com prefixo `hivefw_*`.
- [x] Eventos públicos com prefixo `hivefw_*`.
- [x] Painel/sidebar e recursos estáticos próprios.
- [x] Message store, unread, scopes e helpers pertencem à mesma config entry.
- [x] UI/help removidos de dependências numa segunda integração Home Assistant MeshCore.
- [x] Map uploader e MQTT uploader ligados ao engine HiveFW.
- [x] Telemetria, diagnostics, managed devices e consultas de firmware integradas.
- [x] README/HACS/security atualizados para arquitetura standalone.

## Interface atual — preservar

Estas funcionalidades existem e devem permanecer em qualquer refactor:

- [x] **Dispositivo** com cockpit de métricas e editor de layout.
- [x] Configuração Companion/Repeater.
- [x] Local Advert, Flood Advert, Sync Clock, Trace e Reboot.
- [x] Regions & Scopes.
- [x] RX Log inline e export JSON.
- [x] **Chat & Canais**.
- [x] Histórico persistente, search e unread.
- [x] Gestão de contactos e canais.
- [x] Hops/RSSI/SNR nas mensagens quando disponíveis.
- [x] **Nós** em split view lista + mapa.
- [x] Matching dinâmico do rádio local.
- [x] Contact add/remove no popup do mapa.
- [x] Import/export de contactos.
- [x] Favorites e Tags locais.
- [x] Trace e rota mais recente no mapa.
- [x] Trace Monitor / Route Health on-demand.
- [x] **Vizinhos** zero-hop.
- [x] **Console** com comandos livres e catálogo pré-definido.
- [x] Command history ↑/↓ e transcript.
- [x] RF Health, Airtime, Reliability, Integrity e Current Traffic.
- [x] Network Activity / first-seen.
- [x] 48h Recorder mini-history.

## Próxima fase — mapa, rotas e topologia

- [x] Cores por idade do nó: <1h, <6h, <24h, <7d, stale.
- [x] Filtros: all, active 24h, repeaters, clients, favorites, GPS, stale.
- [x] Route History, não apenas o último Trace.
- [x] Path history por mensagem e ação **Mostrar no mapa**.
- [x] Contagem RX/TX por peer e volume de link.
- [x] Distância hop-to-hop e distância acumulada da rota.
- [x] Topology graph com links baseados em SNR/atividade.
- [x] Activity heatmap com origem dos dados claramente indicada.
- [x] Guardrail de resolução: nunca adivinhar hashes ambíguos; relações/rotas exigem correspondência única.
- [ ] Ferramenta LOS/elevation/Fresnel quando existir uma fonte de elevação adequada.

## Contactos, canais e partilha

- [x] Criar/editar/remover canais.
- [ ] Channel QR.
- [ ] Contact QR / share URI.
- [ ] Bulk cleanup por idade.
- [ ] Proteções de cleanup para favorites, contactos adicionados, Repeaters configurados e tags protegidas.
- [ ] Seleção e ações em massa.
- [x] Pesquisa avançada por nome/public key/tag.

## Administração remota de Repeaters

- [ ] UI dedicada de login remoto.
- [ ] Estado/telemetria/vizinhos remotos consolidados.
- [ ] Path discovery remoto.
- [ ] Trace/Route Health por Repeater.
- [ ] Console administrativo remoto.
- [ ] Estado de firmware/versão.
- [ ] Passwords apenas em config data backend; nunca em payloads frontend.

## Observabilidade

- [x] RF Health.
- [x] Airtime.
- [x] Reliability.
- [x] Erros/duplicates/integrity.
- [x] Taxas atuais RX/TX.
- [x] Network Activity / first-seen.
- [x] Health alerts.
- [x] Recorder history.
- [x] RX Log.
- [x] Trace Monitor.
- [ ] Tendências long-term por peer.
- [ ] Thresholds configuráveis.
- [ ] Notificações/automations HA para transições significativas.

## Firmware / protocolo HiveFW

Itens que exigem alterações ao firmware devem ser tratados no projeto
[HiveFW Companion-Repeater](https://github.com/fabiocguerreiro/HiveFW-Companion-Repeater).

Exemplos:

- [ ] investigar recorrência e recuperação de `CAD Timeout`;
- [ ] expor dados que o Companion protocol ainda não fornece;
- [ ] melhorar telemetria específica de Repeater quando necessário.

## Qualidade e release

- [ ] Python import/compile checks em CI.
- [ ] Frontend build/typecheck em CI.
- [ ] Testes frontend/backend ativos em GitHub Actions.
- [ ] HACS/Home Assistant validation.
- [ ] Fresh install sem `meshcore-ha`.
- [ ] Teste TCP/Wi-Fi.
- [ ] Teste BLE.
- [ ] Teste USB quando disponível.
- [ ] Teste multi-entry.
- [ ] Reload/restart/reconnect.
- [ ] Confirmar ausência de ligações duplicadas ao rádio.
- [ ] Rebuild do bundle após a limpeza da antiga Devices page.
- [ ] Release standalone HiveFW 1.0.0.
