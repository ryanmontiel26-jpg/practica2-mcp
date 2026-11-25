import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Asegurar existencia del directorio de salida
const dirSalida = path.resolve('salida');
if (!fs.existsSync(dirSalida)) {
  fs.mkdirSync(dirSalida, { recursive: true });
}

const rutaTraza = path.join(dirSalida, 'traza.jsonl');
// Limpiar archivo de traza previo si existe
fs.writeFileSync(rutaTraza, '', 'utf8');

// Función auxiliar para registrar en traza.jsonl con sanitización de privacidad (Sección 11.3)
function registrarEnTraza(objetoJson) {
  let linea = JSON.stringify(objetoJson);
  const usuarioActual = process.env.USERNAME || process.env.USER || '';
  if (usuarioActual && usuarioActual.length > 1) {
    linea = linea.replaceAll(usuarioActual, 'TU_USUARIO');
  }
  fs.appendFileSync(rutaTraza, linea + '\n', 'utf8');
}

// ----------------------------------------------------
// PARTE 1: Lanzar el servidor MCP como un subproceso (stdio)
// ----------------------------------------------------
const esWindows = process.platform === 'win32';
const comando = 'npx';
const argumentos = ['-y', '@modelcontextprotocol/server-filesystem', '.'];

const servidor = spawn(comando, argumentos, {
  shell: esWindows,
  stdio: ['pipe', 'pipe', 'inherit']
});

// ----------------------------------------------------
// PARTE 2: Infraestructura JSON-RPC y parsing con readline
// ----------------------------------------------------
const rl = readline.createInterface({
  input: servidor.stdout,
  terminal: false
});

let siguienteId = 1;
const peticionesPendientes = new Map();

// Procesar cada línea recibida del servidor (stdout)
rl.on('line', (linea) => {
  const texto = linea.trim();
  if (!texto) return;

  try {
    const respuesta = JSON.parse(texto);
    registrarEnTraza(respuesta);

    if (respuesta.id !== undefined && peticionesPendientes.has(respuesta.id)) {
      const resolver = peticionesPendientes.get(respuesta.id);
      peticionesPendientes.delete(respuesta.id);
      resolver(respuesta);
    }
  } catch (error) {
    console.error('Error parseando JSON del servidor:', error, texto);
  }
});

// Enviar mensaje crudo por stdin
function enviar(objeto) {
  registrarEnTraza(objeto);
  servidor.stdin.write(JSON.stringify(objeto) + '\n');
}

// Enviar notificación (sin id, no espera respuesta)
function notificar(metodo, params = undefined) {
  const mensaje = {
    jsonrpc: '2.0',
    method: metodo
  };
  if (params !== undefined) {
    mensaje.params = params;
  }
  enviar(mensaje);
}

// Enviar petición (con id correlativo, devuelve Promise)
function solicitar(metodo, params = undefined) {
  return new Promise((resolve) => {
    const id = siguienteId++;
    const mensaje = {
      jsonrpc: '2.0',
      id,
      method: metodo
    };
    if (params !== undefined) {
      mensaje.params = params;
    }
    peticionesPendientes.set(id, resolve);
    enviar(mensaje);
  });
}

// ----------------------------------------------------
// PARTE 3: Flujo de conversación MCP (Actividad B: 7 mensajes)
// ----------------------------------------------------
async function main() {
  console.log('=== Iniciando Cliente MCP Mínimo (Actividad B) ===');

  // 1. Petición INITIALIZE
  console.log('[1] Enviando initialize...');
  const resInit = await solicitar('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: {
      name: 'cliente-mcp-minimo',
      version: '1.0.0'
    }
  });
  console.log('    Respuesta initialize recibida:', resInit.result?.serverInfo?.name);

  // 2. Notificación INITIALIZED
  console.log('[2] Enviando notifications/initialized...');
  notificar('notifications/initialized');

  // 3. Petición TOOLS/LIST
  console.log('[3] Enviando tools/list...');
  const resTools = await solicitar('tools/list', {});
  console.log(`    Herramientas disponibles: ${resTools.result?.tools?.length || 0}`);

  // 4. Invocación de herramienta: list_directory
  console.log('[4] Invocando list_directory en "datos"...');
  const resListDir = await solicitar('tools/call', {
    name: 'list_directory',
    arguments: { path: 'datos' }
  });
  console.log('    Resultado list_directory:', JSON.stringify(resListDir.result?.content));

  console.log('=== Conversación de Actividad B completada con éxito ===');
  servidor.stdin.end();
}

main().catch((err) => {
  console.error('Error durante la ejecución del cliente MCP:', err);
  servidor.kill();
  process.exit(1);
});
