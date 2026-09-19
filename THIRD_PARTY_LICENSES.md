# Third-party notices

## Embedded MeshCore Home Assistant engine

Partes de `custom_components/hivefw_integration/engine/` foram adaptadas de:

- Projeto: `meshcore-dev/meshcore-ha`
- Commit base: `0f99da64be8a0ab6eacd4e87246f2a70e624f2b6`
- Versão upstream na importação: `2.10.0`
- Licença: MIT

O ficheiro `custom_components/hivefw_integration/engine/UPSTREAM_SHA` mantém o commit
base de forma legível por ferramentas/processos de manutenção.

HiveFW não requer a instalação dessa integração upstream no Home Assistant. O código
adaptado faz parte do motor interno da própria integração HiveFW.

Atualizações upstream devem ser integradas como alterações de vendor explícitas e
revistas, preservando as adaptações HiveFW e esta atribuição.

```text
MIT License

Copyright (c) 2025 Alex Wolden

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
