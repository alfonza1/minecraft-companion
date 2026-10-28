import '../native-26.3/preload.cjs';
import mcProtocol from 'minecraft-protocol';

const NETWORK_ERRORS = {
  ECONNREFUSED: 'The Realm refused the connection. Check that it is available, then reconnect.',
  ECONNRESET: 'The Realm connection was reset. Reconnect when it is available.',
  ETIMEDOUT: 'The Realm connection timed out. Check your connection and Realm availability.',
  ENOTFOUND: 'The Realm address could not be resolved. Check your connection.',
};

// Client is minecraft-protocol's supported transport extension. Microsoft
// authentication can finish after Stop; an ended body must never gain a socket.
export class NativeRealmClient extends mcProtocol.Client {
  end(reason) { this.companionCancelled = true; return super.end(reason); }
  setSocket(socket) {
    if (this.companionCancelled) { socket.once('error', () => {}); socket.destroy(); return; }
    return super.setSocket(socket);
  }
  emit(event, ...args) {
    if (event === 'error') {
      if (this.companionCancelled) return false;
      // Auth provider exceptions may contain request credentials. Only stable
      // diagnoses cross into Mineflayer/runtime logging and dashboard state.
      const code = args[0]?.code;
      const message = Object.hasOwn(NETWORK_ERRORS, code) ? NETWORK_ERRORS[code] : 'Minecraft connection failed. Check the saved account session and Realm availability, then reconnect.';
      args[0] = new Error(message);
    }
    return super.emit(event, ...args);
  }
}
