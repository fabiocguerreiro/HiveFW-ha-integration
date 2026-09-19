<p align="center">
  <img src="custom_components/hivefw_integration/brand/logo.png" alt="HiveFW" width="420">
</p>

# HiveFW para Home Assistant

**HiveFW** é uma integração standalone para Home Assistant orientada ao
[HiveFW Companion-Repeater](https://github.com/fabiocguerreiro/HiveFW-Companion-Repeater).

A integração é responsável pela ligação ao rádio, entidades, serviços, eventos, histórico
de mensagens e interface lateral. **Não é necessário instalar a integração Home Assistant
`meshcore-ha` em separado.** O protocolo/SDK MeshCore continua a ser usado internamente,
mas a superfície pública no Home Assistant pertence ao HiveFW.

## HiveFW 1.1.0

A versão 1.1.0 consolida a integração como painel de operação completo do
Companion-Repeater. Entre as principais adições:

- topologia observada e heatmap de atividade a partir do histórico local;
- distâncias de rota hop-to-hop e acumuladas;
- análise LOS, elevação e 60% da primeira zona de Fresnel on-demand;
- QR/URI para partilha de contactos e canais;
- seleção e ações em massa, incluindo cleanup protegido com dry-run;
- administração remota consolidada de Repeaters;
- tendências de atividade 7/30 dias por peer;
- thresholds de saúde configuráveis, evento `hivefw_health_transition` e
  notificações persistentes opcionais.


## Arquitetura

```text
Home Assistant
      │
      └── HiveFW
            ├── TCP / Wi-Fi
            ├── BLE
            └── USB
                  │
                  ▼
        HiveFW Companion-Repeater
                  │
                  ▼
             Rede MeshCore
```

O firmware HiveFW é Companion primeiro. Quando o modo Repeater é ativado no rádio,
continua a existir uma ligação Companion para Home Assistant enquanto o dispositivo
participa na rede como Repeater.

## Interface

O painel **HiveFW** é registado automaticamente na barra lateral do Home Assistant.

### Dispositivo

Centro de monitorização e configuração do rádio selecionado.

Inclui, quando disponíveis:

- bateria, tensão, temperatura e uptime;
- frequência, bandwidth, spreading factor, coding rate e TX power;
- RSSI, SNR, noise floor e TX queue;
- TX/RX airtime e taxas de mensagens;
- fiabilidade, integridade e erros de receção;
- relógio interno e drift;
- armazenamento, capacidade de contactos/canais e Path Hash;
- estado Companion/Repeater;
- frequências permitidas para Repeater;
- localização;
- radio faults reportados pelo firmware;
- histórico de métricas via Home Assistant Recorder.

A página inclui ainda:

- **Local Advert**;
- **Flood Advert**;
- **Sync Clock**;
- **Trace**;
- **Reboot**;
- **Regions & Scopes**;
- **RX Log** integrado, com filtro, RSSI/SNR/hops/path e exportação JSON;
- configuração do rádio e do modo Repeater.

Os radio faults são indicadores acumulados pelo firmware. Por exemplo,
`Radio Fault: CAD Timeout = Detected` significa que o evento ocorreu pelo menos uma
vez desde o último arranque/reset das estatísticas; não significa necessariamente que
o erro esteja ativo nesse instante.

### Chat & Canais

Interface de mensagens para canais e contactos:

- canais e mensagens diretas;
- histórico persistente;
- estado unread;
- pesquisa;
- gestão de contactos e canais;
- scopes por canal;
- informação de entrega;
- metadados RX nas mensagens recebidas, incluindo hops, RSSI e SNR quando disponíveis.

Bots e automações devem ser preferencialmente **on-demand**. A rede LoRa é um recurso
partilhado e não deve ser inundada com tráfego periódico desnecessário.

### Nós

Vista de descoberta/contactos com lista e mapa lado a lado.

Funcionalidades principais:

- Added / Discovered;
- Clients / Repeaters / Room Servers / Sensors;
- pesquisa e filtros;
- mapa com nós que possuem coordenadas;
- popup persistente no mapa;
- adicionar/remover contactos;
- Favorites e Tags locais;
- importação e exportação de contactos no formato compatível com a app MeshCore;
- Trace e Route Health;
- Trace Monitor on-demand;
- Route History e rota de mensagens no mapa;
- distância hop-to-hop e distância total da rota;
- grafo de topologia baseado apenas em caminhos realmente observados;
- heatmap de atividade baseado em RX/TX e aparições em paths;
- análise **LOS / Fresnel** entre o rádio local e um nó com GPS;
- seleção múltipla e ações em massa;
- cleanup por idade com pré-visualização e proteções para Favorites, contactos adicionados,
  Repeaters configurados e tags protegidas.

A resolução de hashes é conservadora: quando um hash é ambíguo, o HiveFW não inventa
uma correspondência.

Contactos e canais podem ser partilhados por **QR/URI MeshCore**. Para canais, o URI
contém a chave necessária à importação e deve ser tratado como credencial.

A análise LOS é executada apenas quando pedida. As coordenadas interpoladas do percurso
são enviadas à API pública de elevação Open-Meteo, que fornece o modelo
Copernicus DEM GLO-90. Não existe consulta de elevação em background e esta função não
gera tráfego RF.

### Administração remota de Repeaters

Os Repeaters configurados aparecem no **Dispositivo** com acesso a uma janela
administrativa dedicada. A partir daí é possível, on-demand:

- consultar estado, firmware e telemetria já disponível;
- consultar vizinhos remotos;
- testar o acesso administrativo;
- executar Path + Trace;
- abrir Route Health;
- executar comandos CLI no console remoto.

A password administrativa fica exclusivamente no `ConfigEntry` do backend. O frontend
recebe apenas indicação de que existe uma credencial configurada e nunca recebe o valor.

### Vizinhos

Mostra Repeaters ouvidos diretamente pelo HiveFW a partir da informação já disponível
no Companion.

A leitura desta página é local ao Companion e não envia pacotes LoRa apenas para atualizar
a interface.

### Console

Console administrativo integrado para o rádio selecionado:

- comandos livres;
- Enter para executar;
- histórico de comandos com ↑ / ↓;
- transcript com resposta, timestamp e erros;
- limpar/atualizar histórico;
- atalhos para comandos frequentes;
- catálogo completo de comandos pré-definidos com parâmetros e avisos;
- seleção do dispositivo HiveFW ativo.

Comandos de configuração são executados exatamente como indicados e podem alterar
estado persistente do rádio.

## Alertas e automações

O HiveFW avalia localmente as entidades de diagnóstico e pode detetar transições de
saúde sem gerar tráfego LoRa adicional.

Os thresholds configuráveis incluem:

- noise floor;
- TX queue;
- taxa de RX errors;
- fiabilidade mínima e tamanho mínimo da amostra.

Uma mudança de estado dispara o evento:

```text
hivefw_health_transition
```

O payload inclui `entry_id`, nome do dispositivo, estado atual, alertas ativos,
alertas que entraram/saíram e os thresholds usados. Isto permite criar automações
Home Assistant sem depender de polling RF. Notificações persistentes do Home Assistant
podem ser ativadas opcionalmente na página **Dispositivo**.

## Identidade no Home Assistant

A integração usa uma identidade própria e consistente:

```text
Integração / serviços: hivefw_integration
Entidades:             sensor.hivefw_*
                       binary_sensor.hivefw_*
                       select.hivefw_*
                       device_tracker.hivefw_*
                       ...
Eventos:               hivefw_*
Painel:                /hivefw
```

Referências a `meshcore` que permanecem no código dizem respeito ao protocolo, SDK,
formatos compatíveis ou atribuição de código upstream — não a uma segunda integração HA.

## Requisitos

- Home Assistant 2024.12 ou superior;
- um Companion compatível acessível por TCP/Wi-Fi, BLE ou USB;
- para todas as funcionalidades específicas de Companion-Repeater:
  [HiveFW Companion-Repeater](https://github.com/fabiocguerreiro/HiveFW-Companion-Repeater).

A ligação recomendada para instalações permanentes é **TCP/Wi-Fi**, especialmente quando
Home Assistant e o rádio permanecem na mesma rede local.

## Instalação com HACS

Adicionar este repositório como integração personalizada:

```text
https://github.com/fabiocguerreiro/HiveFW-ha-integration
```

Depois:

1. Abrir **HACS → Integrations → Custom repositories**.
2. Adicionar o URL acima como **Integration**.
3. Instalar **HiveFW**.
4. Reiniciar Home Assistant.
5. Abrir **Definições → Dispositivos e Serviços → Adicionar integração**.
6. Procurar **HiveFW**.
7. Selecionar TCP/Wi-Fi, BLE ou USB e configurar a ligação ao rádio.
8. Abrir **HiveFW** na barra lateral.

O projeto assume uma instalação limpa do HiveFW. Não é mantida uma camada de migração
para instalações antigas de `meshcore-ha-chat` ou para uma segunda integração
`meshcore-ha`.

## Atualizações

Alterações Python/backend normalmente requerem reload da integração ou restart do
Home Assistant. Alterações frontend podem necessitar de refresh completo do browser
(`Ctrl+F5`).

Quando forem alterados simultaneamente backend, painel global ou registo de recursos
estáticos, é preferível reiniciar Home Assistant.

## Tráfego de rede

Nem todas as ações da interface geram LoRa.

Normalmente locais ao Home Assistant/Companion:

- leitura de entidades;
- cockpit de métricas;
- RX Log já armazenado;
- histórico de mensagens;
- mapa baseado em contactos já conhecidos;
- topologia e heatmap derivados de histórico já guardado;
- tendências 7/30 dias por peer;
- avaliação de thresholds e eventos de saúde;
- leitura de configuração local.

Podem gerar tráfego RF:

- envio de mensagens;
- Flood Advert;
- Trace / path discovery;
- comandos remotos;
- leitura/alteração de configuração de Repeaters remotos;
- ações de administração remota executadas explicitamente.

Operações RF periódicas não são iniciadas automaticamente quando podem ser feitas
on-demand.

A função LOS/Fresnel é uma exceção à operação exclusivamente local: quando acionada,
faz uma consulta HTTPS on-demand ao serviço de elevação Open-Meteo com as coordenadas
do perfil. Esta consulta não usa LoRa.

## Segurança

Dados vindos da mesh devem ser considerados não confiáveis. Nomes de nós, mensagens e
outros campos provenientes do rádio são renderizados como texto, e operações que alteram
rádio/configuração são protegidas no backend por permissões de administrador do Home
Assistant.

Ver [SECURITY.md](SECURITY.md) para política de reporte e modelo de confiança.

## Desenvolvimento

Frontend:

```bash
cd frontend
npm ci
npm run typecheck
npm run build
npm test
```

Backend:

```bash
python -m pytest tests/
```

O source TypeScript vive em `frontend/src/`. O bundle utilizado pelo Home Assistant é:

```text
custom_components/hivefw_integration/hivefw-integration-panel.js
```

O wrapper HiveFW que acrescenta a UI específica do projeto é:

```text
custom_components/hivefw_integration/hivefw-panel.js
```

Uma build de frontend deve ser feita sempre que forem removidos módulos/imports do source,
para que código morto também desapareça do bundle distribuído.

## Estrutura do repositório

```text
custom_components/hivefw_integration/
    integração Home Assistant, engine, WebSocket API, painel e branding

frontend/
    source TypeScript/Lit e testes frontend

tests/
    testes backend

ROADMAP.md
    estado de implementação e checklist temporário de validação pós-HACS
```

## Código upstream e licenças

Parte do motor interno foi adaptada de
[meshcore-dev/meshcore-ha](https://github.com/meshcore-dev/meshcore-ha).
O SDK/protocolo MeshCore continua a ser uma dependência de implementação.

A proveniência e os avisos de licença upstream estão consolidados no
[LICENSE](LICENSE).

Projetos relacionados:

- [HiveFW Companion-Repeater](https://github.com/fabiocguerreiro/HiveFW-Companion-Repeater)
- [MeshCore](https://github.com/meshcore-dev/MeshCore)
- [meshcore_py](https://github.com/meshcore-dev/meshcore_py)

## Histórico de alterações

O histórico detalhado é mantido pelo Git e pelas releases/commits do repositório, evitando duplicar documentação de versões antigas num changelog manual. A versão 1.1.0 corresponde à conclusão da fase funcional descrita no ROADMAP; depois da validação em hardware esse ficheiro pode ser removido.

## Disclaimer

Este é um projeto custom/experimental. A utilização e configuração do rádio são da
responsabilidade do utilizador.

Respeita os limites legais de frequência/potência aplicáveis e evita automações, bots ou
polling RF que provoquem flood desnecessário numa rede partilhada.

## Licença

MIT — ver [LICENSE](LICENSE).
