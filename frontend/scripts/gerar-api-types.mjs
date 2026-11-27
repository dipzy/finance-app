// Gera services/api-types.ts (tipos TypeScript) a partir do documento OpenAPI da API.
//
//   npm run gerar:api                       arranca a API local em SQLite (base temporária), descarrega
//                                           /openapi/v1.json, gera o ficheiro e pára a API
//   OPENAPI_URL=https://.../openapi/v1.json npm run gerar:api
//                                           usa uma API que já está a correr (não arranca nada)
//   npm run gerar:api -- --verificar        não escreve: sai com código 1 se o ficheiro commitado
//                                           for diferente do gerado (usado no CI)
//
// Precisa do SDK do .NET 10 (só quando não há OPENAPI_URL).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projetoApi = resolve(raiz, '..', 'backend', 'src', 'Financas.Api');
const destino = join(raiz, 'services', 'api-types.ts');
const verificar = process.argv.includes('--verificar');
const porta = process.env.API_PORTA ?? '5199';
const pasta = mkdtempSync(join(tmpdir(), 'financas-openapi-'));
let api = null;

async function esperar(url, tentativas = 90) {
  for (let i = 0; i < tentativas; i++) {
    if (api && api.exitCode !== null) throw new Error(`A API terminou (código ${api.exitCode}) antes de ficar pronta.`);
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* ainda a arrancar */
    }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  throw new Error(`A API não respondeu em ${url}.`);
}

function parar() {
  if (api && api.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(api.pid), '/T', '/F']);
    else api.kill('SIGTERM');
  }
  // No Windows o SQLite ainda pode ter o ficheiro aberto uns instantes: a pasta é temporária, não vale a pena falhar
  try {
    rmSync(pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    /* fica no diretório temporário do sistema */
  }
}

try {
  let urlOpenApi = process.env.OPENAPI_URL;
  if (!urlOpenApi) {
    const base = `http://127.0.0.1:${porta}`;
    console.log(`A arrancar a API local (SQLite temporário) em ${base} ...`);
    api = spawn('dotnet', ['run', '--project', projetoApi, '--no-launch-profile'], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Development',
        ASPNETCORE_URLS: base,
        ConnectionStrings__Financas: `Data Source=${join(pasta, 'openapi.db')}`,
      },
    });
    await esperar(`${base}/saude`);
    urlOpenApi = `${base}/openapi/v1.json`;
  }

  console.log(`A descarregar ${urlOpenApi} ...`);
  const resposta = await fetch(urlOpenApi);
  if (!resposta.ok) throw new Error(`${urlOpenApi} respondeu ${resposta.status}.`);
  const documento = join(pasta, 'openapi.json');
  writeFileSync(documento, await resposta.text());

  const saida = verificar ? join(pasta, 'api-types.ts') : destino;
  const bin = join(raiz, 'node_modules', 'openapi-typescript', 'bin', 'cli.js');
  if (!existsSync(bin)) throw new Error('openapi-typescript não está instalado: corre "npm ci" em frontend/.');
  const gerado = spawnSync(process.execPath, [bin, documento, '--output', saida], { stdio: 'inherit' });
  if (gerado.status !== 0) throw new Error('O openapi-typescript falhou.');

  if (verificar && !existsSync(destino)) {
    console.log('services/api-types.ts ainda não existe (corre "npm run gerar:api" para o criar); a geração a partir da API funciona.');
  } else if (verificar) {
    const atual = existsSync(destino) ? readFileSync(destino, 'utf8') : '';
    if (atual.replace(/\r\n/g, '\n') !== readFileSync(saida, 'utf8').replace(/\r\n/g, '\n')) {
      console.error('services/api-types.ts está desatualizado em relação à API: corre "npm run gerar:api".');
      process.exitCode = 1;
    } else {
      console.log('services/api-types.ts está em dia.');
    }
  } else {
    console.log('Gerado: services/api-types.ts');
  }
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
} finally {
  parar();
}
