package tr.com.cs.kyc_live_interview_api.config;

import com.corundumstudio.socketio.SocketIOServer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.CommandLineRunner;

@Configuration
public class SocketIOServerConfig {

    @Value("${socket.host}")
    private String host;

    @Value("${socket.port}")
    private int port;

    @Bean(destroyMethod = "stop")
    public SocketIOServer socketIOServer() {
        com.corundumstudio.socketio.Configuration config =
                new com.corundumstudio.socketio.Configuration();
        config.setHostname(host);
        config.setPort(port);

        // DEV: allow all origins so wss upgrade via NGINX doesn't get blocked
        // Lock this down later to "https://localhost,<your-ngrok-domain>"
        config.setOrigin("https://localhost,http://localhost");

        config.setUpgradeTimeout(10000);
        config.setPingTimeout(60000);
        config.setPingInterval(25000);

        return new SocketIOServer(config);
    }

    @Bean
    public CommandLineRunner startSocketServer(SocketIOServer server) {
        return args -> {
            server.start();
            System.out.println("✅ Socket.IO server started on " + host + ":" + port);
        };
    }
}
