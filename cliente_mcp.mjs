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
// PARTE 3: Conversación MCP Expandida (Actividad C: 13 mensajes)
// ----------------------------------------------------
async function main() {
  console.log('=== Iniciando Cliente MCP Completo (Actividades B y C) ===');

  // 1. Petición INITIALIZE (Msg 1 -> Res 2)
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

  // 2. Notificación INITIALIZED (Msg 3)
  console.log('[2] Enviando notifications/initialized...');
  notificar('notifications/initialized');

  // 3. Petición TOOLS/LIST (Msg 4 -> Res 5)
  console.log('[3] Enviando tools/list...');
  const resTools = await solicitar('tools/list', {});
  console.log(`    Herramientas disponibles: ${resTools.result?.tools?.length || 0}`);

  // 4. Invocación: list_directory en "datos" (Msg 6 -> Res 7)
  console.log('[4] Invocando list_directory en "datos"...');
  const resListDir = await solicitar('tools/call', {
    name: 'list_directory',
    arguments: { path: 'datos' }
  });
  console.log('    Resultado list_directory:', JSON.stringify(resListDir.result?.content));

  // 5. Invocación: read_text_file en datos/calificaciones.csv (Lectura válida) (Msg 8 -> Res 9)
  console.log('[5] Invocando read_text_file en "datos/calificaciones.csv" (lectura válida)...');
  const resReadValid = await solicitar('tools/call', {
    name: 'read_text_file',
    arguments: { path: 'datos/calificaciones.csv' }
  });
  console.log('    Lectura válida exitosa. Caracteres leídos:', resReadValid.result?.content?.[0]?.text?.length || 0);

  // 6. Invocación: read_text_file fuera de límites (C:/Windows/win.ini) (Tool Execution Error) (Msg 10 -> Res 11)
  const rutaProhibida = esWindows ? 'C:/Windows/win.ini' : '/etc/hosts';
  console.log(`[6] Invocando read_text_file fuera de límites: "${rutaProhibida}" (error de ejecución de herramienta)...`);
  const resReadForbidden = await solicitar('tools/call', {
    name: 'read_text_file',
    arguments: { path: rutaProhibida }
  });
  console.log('    Resultado fuera de límites (isError):', resReadForbidden.result?.isError);
  console.log('    Mensaje de denegación:', resReadForbidden.result?.content?.[0]?.text);

  // 7. Petición de método no existente (Protocol Error) (Msg 12 -> Res 13)
  console.log('[7] Invocando método no existente "herramientas/inventada" (error de protocolo JSON-RPC)...');
  const resMethodNotFound = await solicitar('herramientas/inventada', {});
  console.log('    Error de protocolo recibido:', JSON.stringify(resMethodNotFound.error));

  console.log('=== Conversación de Actividad C completada con éxito (13 mensajes) ===');
  servidor.stdin.end();
}

main().catch((err) => {
  console.error('Error durante la ejecución del cliente MCP:', err);
  servidor.kill();
  process.exit(1);
});
