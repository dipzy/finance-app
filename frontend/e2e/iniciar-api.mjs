// Arranca a API .NET para os testes E2E: SQLite novo, Development e autenticação pelo cabeçalho
// X-Utilizador (backend/src/Financas.Api/Autenticacao/AutenticacaoPorCabecalho.cs). Chamado pelo
// playwright.config.ts (webServer). Multiplataforma: apaga a base de dados antiga e lança o dotnet.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const porta = process.env.E2E_API_PORTA ?? '5081';
const origemApp = process.env.E2E_APP_URL ?? 'http://localhost:8099';
const pasta = join(tmpdir(), 'financas-e2e');
const baseDeDados = join(pasta, 'e2e.db');

mkdirSync(pasta, { recursive: true });
for (const sufixo of ['', '-shm', '-wal']) rmSync(baseDeDados + sufixo, { force: true });

const projeto = resolve(aqui, '..', '..', 'backend', 'src', 'Financas.Api');
// -p:UseAppHost=false: corre a API com "dotnet Financas.Api.dll" em vez do .exe gerado, que o Windows
// com Controlo de Aplicações (Smart App Control / WDAC) pode bloquear por não ser assinado
const filho = spawn('dotnet', ['run', '--project', projeto, '--no-launch-profile', '-p:UseAppHost=false'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: 'Development',
    ASPNETCORE_URLS: `http://localhost:${porta}`,
    ConnectionStrings__Financas: `Data Source=${baseDeDados}`,
    Autenticacao__CabecalhoDesenvolvimento: 'true',
    Cors__Origens__0: origemApp,
    // Os testes fazem muitos pedidos seguidos: sem o limite por minuto
    LimitesPedidos__PorMinuto: '100000',
  },
});

for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => filho.kill());
filho.on('exit', (codigo) => process.exit(codigo ?? 0));
