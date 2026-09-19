# HiveFW Home Assistant — Estado de implementação

A fase funcional planeada para a integração standalone **HiveFW 1.1.1** está implementada.
Este ficheiro fica temporariamente como checklist de validação pós-HACS. Depois da
validação em hardware pode ser removido e o histórico passa a viver nas releases/commits.

## Implementação concluída

- [x] Integração standalone: ligação TCP/Wi-Fi, BLE ou USB sem `meshcore-ha` separado.
- [x] Engine MeshCore incorporado sob `hivefw_integration`.
- [x] Entidades, serviços, eventos, storage, WebSocket API e painel próprios.
- [x] Dispositivo: métricas compactas, Repeater, Regions & Scopes, RX Log e Console.
- [x] Chat & Canais com histórico, unread, pesquisa, scopes e metadados RX.
- [x] Nós em split view lista + mapa, filtros, Favorites, Tags, import/export.
- [x] Route History e path por mensagem.
- [x] Distância hop-to-hop e distância acumulada.
- [x] Topologia observada por paths reais, com volume e SNR.
- [x] Heatmap de atividade derivado do histórico local.
- [x] Resolução conservadora: hashes ambíguos nunca são adivinhados.
- [x] LOS/elevation/Fresnel on-demand com perfil de terreno.
- [x] Channel QR / URI MeshCore.
- [x] Contact QR / URI MeshCore.
- [x] Seleção e ações em massa.
- [x] Bulk cleanup por idade com dry-run.
- [x] Proteções de cleanup para Favorites, contactos adicionados, Repeaters configurados e tags protegidas.
- [x] Administração remota de Repeaters: acesso, estado, firmware, vizinhos, Path/Trace, Route Health e console.
- [x] Passwords remotas permanecem no backend/ConfigEntry e nunca são devolvidas ao frontend.
- [x] Tendências 7/30 dias por peer a partir do histórico local.
- [x] Thresholds de saúde configuráveis.
- [x] Evento HA `hivefw_health_transition` para automações.
- [x] Notificações persistentes opcionais em transições de alerta.
- [x] Python compile/test em CI.
- [x] Frontend typecheck/build/test em CI.
- [x] Hassfest e HACS validation em CI.
- [x] Versão preparada como HiveFW 1.1.1.

## Trabalho de firmware — fora deste repositório

Os pontos abaixo pertencem ao
[HiveFW Companion-Repeater](https://github.com/fabiocguerreiro/HiveFW-Companion-Repeater),
não à integração Home Assistant:

- investigação da recorrência/recuperação de `CAD Timeout`;
- novos campos que o Companion Protocol ainda não disponibilize;
- telemetria adicional específica do firmware Repeater.

## Validação pós-HACS em hardware

Estes pontos não devem ser marcados como concluídos sem teste real:

- [ ] Instalação limpa sem `meshcore-ha`.
- [ ] TCP/Wi-Fi.
- [ ] BLE.
- [ ] USB, quando houver hardware disponível.
- [ ] Multi-entry.
- [ ] Reload / restart / reconnect.
- [ ] Confirmar ausência de ligações duplicadas ao rádio.
- [ ] Confirmar nome do Device Registry sem prefixo `MeshCore` nem sufixo de pubkey.
- [ ] Confirmar header: nome do Repeater seguido imediatamente pelo logo HiveFW.
- [ ] Confirmar QR de contactos/canais na app MeshCore.
- [ ] Confirmar administração remota com um Repeater real.
- [ ] Confirmar LOS/Fresnel com dois nós GPS conhecidos.

## Nota sobre o bundle

O source TypeScript continua validado e compilado em CI. A camada
`custom_components/hivefw_integration/hivefw-panel.js` é o wrapper distribuído que
aplica as funcionalidades HiveFW e mantém compatibilidade com o bundle base atualmente
incluído no repositório. Uma futura consolidação pode absorver todo o wrapper no source
TypeScript e eliminar definitivamente essa camada de compatibilidade.
