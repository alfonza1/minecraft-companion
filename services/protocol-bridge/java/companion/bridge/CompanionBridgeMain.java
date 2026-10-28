package companion.bridge;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import net.raphimc.viaproxy.ViaProxy;

/** Owns the private, in-memory configuration shared with the ViaProxy plugin. */
public final class CompanionBridgeMain {
    private static final int MAX_CONFIGURATION_BYTES = 65_536;
    private static BridgeConfiguration configuration;

    private CompanionBridgeMain() {}

    public static BridgeConfiguration configuration() {
        if (configuration == null) throw new IllegalStateException("Bridge configuration is unavailable.");
        return configuration;
    }

    public static void main(String[] args) {
        try {
            if (args.length == 0 || !"cli".equals(args[0])) {
                throw new IllegalArgumentException("Headless CLI arguments are required.");
            }
            configuration = BridgeConfiguration.parse(readConfiguration(System.in));
            System.setIn(InputStream.nullInputStream());
            Runtime.getRuntime().addShutdownHook(new Thread(configuration::close, "companion-bridge-cleanup"));
            ViaProxy.main(args);
        } catch (Throwable failure) {
            // Parsing errors can contain source text; never forward their messages or stack traces.
            System.err.println("Minecraft Companion protocol bridge could not start.");
            if (configuration != null) configuration.close();
            System.exit(1);
        }
    }

    private static String readConfiguration(InputStream input) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int next;
        while ((next = input.read()) != -1 && next != '\n') {
            if (bytes.size() >= MAX_CONFIGURATION_BYTES) {
                throw new IllegalArgumentException("Bridge configuration exceeds its limit.");
            }
            bytes.write(next);
        }
        if (bytes.size() == 0) throw new IllegalArgumentException("Bridge configuration is missing.");
        return StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
    }
}
