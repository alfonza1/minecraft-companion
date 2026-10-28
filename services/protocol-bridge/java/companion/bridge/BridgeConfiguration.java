package companion.bridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.authlib.GameProfile;
import com.viaversion.viaversion.api.minecraft.ProfileKey;
import com.viaversion.viaversion.api.minecraft.signature.storage.ChatSession1_19_3;
import java.io.IOException;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Never serialized: authentication tokens remain in the owning Node process. */
public final class BridgeConfiguration implements AutoCloseable {
    private static final Duration JOIN_TIMEOUT = Duration.ofSeconds(10);
    private static final int MAX_KEY_BYTES = 16_384;
    private final URI joinUri;
    private final String capability;
    private final UUID profileId;
    private final String profileName;
    private final String allowedUsername;
    private final PrivateKey privateKey;
    private final ProfileKey profileKey;
    private final ExecutorService executor;
    private final HttpClient client;

    private BridgeConfiguration(URI callback, String capability, UUID profileId, String profileName,
                                String allowedUsername, PrivateKey privateKey, ProfileKey profileKey) {
        this.joinUri = callback.resolve("/join");
        this.capability = capability;
        this.profileId = profileId;
        this.profileName = profileName;
        this.allowedUsername = allowedUsername;
        this.privateKey = privateKey;
        this.profileKey = profileKey;
        this.executor = Executors.newFixedThreadPool(2, task -> {
            Thread thread = new Thread(task, "companion-session-callback");
            thread.setDaemon(true);
            return thread;
        });
        this.client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER)
            .executor(this.executor)
            .proxy(new ProxySelector() {
                @Override public List<Proxy> select(URI uri) { return List.of(Proxy.NO_PROXY); }
                @Override public void connectFailed(URI uri, SocketAddress address, IOException failure) {}
            }).build();
    }

    public static BridgeConfiguration parse(String source) throws Exception {
        JsonObject data = JsonParser.parseString(source).getAsJsonObject();
        URI callback = URI.create(requiredString(data, "callback"));
        if (!"http".equals(callback.getScheme()) || !"127.0.0.1".equals(callback.getHost())
                || callback.getPort() < 1 || callback.getPort() > 65535
                || callback.getUserInfo() != null || callback.getRawQuery() != null
                || callback.getRawFragment() != null
                || !(callback.getRawPath().isEmpty() || "/".equals(callback.getRawPath()))) {
            throw new IllegalArgumentException("Callback must be an explicit loopback HTTP endpoint.");
        }
        String capability = requiredString(data, "capability");
        if (!capability.matches("[a-fA-F0-9]{64}")) throw new IllegalArgumentException("Invalid callback capability.");
        JsonObject profile = data.getAsJsonObject("profile");
        String id = requiredString(profile, "id");
        if (!id.matches("[a-fA-F0-9]{32}")) throw new IllegalArgumentException("Invalid profile UUID.");
        UUID profileId = UUID.fromString(id.replaceFirst("(.{8})(.{4})(.{4})(.{4})(.{12})", "$1-$2-$3-$4-$5"));
        String profileName = validatedName(requiredString(profile, "name"));
        String allowedUsername = validatedName(requiredString(data, "allowedUsername"));
        PrivateKey privateKey = null;
        ProfileKey profileKey = null;
        if (data.has("certificates") && !data.get("certificates").isJsonNull()) {
            JsonObject certificates = data.getAsJsonObject("certificates");
            byte[] publicDer = decodedKey(certificates, "publicDER");
            byte[] privateDer = decodedKey(certificates, "privateDER");
            byte[] signature = decodedKey(certificates, "signatureV2");
            Instant expiry = Instant.parse(requiredString(certificates, "expiresOn"));
            if (!expiry.isAfter(Instant.now())) throw new IllegalArgumentException("Expired player certificates.");
            KeyFactory keys = KeyFactory.getInstance("RSA");
            keys.generatePublic(new X509EncodedKeySpec(publicDer));
            privateKey = keys.generatePrivate(new PKCS8EncodedKeySpec(privateDer));
            profileKey = new ProfileKey(expiry.toEpochMilli(), publicDer, signature);
            java.util.Arrays.fill(privateDer, (byte) 0);
        }
        return new BridgeConfiguration(callback, capability, profileId, profileName, allowedUsername, privateKey, profileKey);
    }

    public GameProfile gameProfile() { return new GameProfile(this.profileId, this.profileName); }
    public String allowedUsername() { return this.allowedUsername; }
    public boolean hasCertificates() { return this.privateKey != null; }

    public ChatSession1_19_3 chatSession() {
        if (!hasCertificates()) throw new IllegalStateException("Player certificates are unavailable.");
        return new ChatSession1_19_3(this.profileId, this.privateKey, this.profileKey);
    }

    public void joinServer(String serverIdHash) throws Exception {
        if (serverIdHash == null || !serverIdHash.matches("-?[a-f0-9]{1,40}")) {
            throw new IllegalArgumentException("Invalid session server hash.");
        }
        JsonObject body = new JsonObject();
        body.addProperty("serverIdHash", serverIdHash);
        HttpRequest request = HttpRequest.newBuilder(this.joinUri)
            .timeout(JOIN_TIMEOUT)
            .header("Authorization", "Bearer " + this.capability)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build();
        HttpResponse<Void> response = this.client.send(request, HttpResponse.BodyHandlers.discarding());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("Session authorization was rejected.");
        }
    }

    @Override public void close() { this.executor.shutdownNow(); }
    @Override public String toString() { return "BridgeConfiguration[private]"; }

    private static String requiredString(JsonObject data, String key) {
        if (data == null || !data.has(key) || !data.get(key).isJsonPrimitive()
                || !data.getAsJsonPrimitive(key).isString()) {
            throw new IllegalArgumentException("Missing bridge configuration field.");
        }
        return data.get(key).getAsString();
    }

    private static String validatedName(String name) {
        if (!name.matches("[A-Za-z0-9_]{1,16}")) throw new IllegalArgumentException("Invalid Minecraft username.");
        return name;
    }

    private static byte[] decodedKey(JsonObject data, String key) {
        String encoded = requiredString(data, key);
        if (encoded.length() > MAX_KEY_BYTES * 2) throw new IllegalArgumentException("Player certificate exceeds its limit.");
        byte[] decoded = Base64.getDecoder().decode(encoded);
        if (decoded.length == 0 || decoded.length > MAX_KEY_BYTES) throw new IllegalArgumentException("Invalid player certificate.");
        return decoded;
    }
}
