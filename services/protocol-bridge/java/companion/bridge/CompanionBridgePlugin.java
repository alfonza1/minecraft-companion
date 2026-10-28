package companion.bridge;

import java.net.InetSocketAddress;
import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;
import net.lenni0451.lambdaevents.EventHandler;
import net.raphimc.viaproxy.ViaProxy;
import net.raphimc.viaproxy.plugins.ViaProxyPlugin;
import net.raphimc.viaproxy.plugins.events.FillPlayerDataEvent;
import net.raphimc.viaproxy.plugins.events.JoinServerRequestEvent;
import net.raphimc.viaproxy.proxy.session.ProxyConnection;

/** Client-side plugin only; nothing is installed on the Realm. */
public final class CompanionBridgePlugin extends ViaProxyPlugin {
    private BridgeConfiguration configuration;
    private final Set<ProxyConnection> acceptedConnections = Collections.synchronizedSet(Collections.newSetFromMap(new WeakHashMap<>()));

    @Override public void onEnable() {
        this.configuration = CompanionBridgeMain.configuration();
        ViaProxy.EVENT_MANAGER.register(this);
    }

    @EventHandler public void fillPlayerData(FillPlayerDataEvent event) {
        ProxyConnection connection = event.getProxyConnection();
        if (!isAuthorizedClient(connection)) {
            connection.kickClient("Minecraft Companion rejected this local connection.");
            return;
        }
        this.acceptedConnections.add(connection);
        connection.setGameProfile(this.configuration.gameProfile());
        if (this.configuration.hasCertificates()) {
            connection.getUserConnection().put(this.configuration.chatSession());
        }
    }

    @EventHandler public void joinServer(JoinServerRequestEvent event) {
        ProxyConnection connection = event.getProxyConnection();
        if (!this.acceptedConnections.contains(connection)) {
            event.setCancelled(true);
            connection.kickClient("Minecraft Companion rejected this local connection.");
            return;
        }
        try {
            this.configuration.joinServer(event.getServerIdHash());
            event.setCancelled(true);
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            rejectSession(event);
        } catch (Exception failure) {
            rejectSession(event);
        }
    }

    @Override public void onDisable() {
        ViaProxy.EVENT_MANAGER.unregister(this);
        this.acceptedConnections.clear();
        if (this.configuration != null) this.configuration.close();
    }

    private boolean isAuthorizedClient(ProxyConnection connection) {
        return connection.getC2P().remoteAddress() instanceof InetSocketAddress address
                && address.getAddress() != null && address.getAddress().isLoopbackAddress()
                && this.configuration.allowedUsername().equals(connection.getLoginHelloPacket().name);
    }

    private void rejectSession(JoinServerRequestEvent event) {
        event.setCancelled(true);
        event.getProxyConnection().kickClient("Minecraft Companion could not authorize the Minecraft session. Reconnect the account and try again.");
    }
}
