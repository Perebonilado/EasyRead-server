# The exchange: LiveKit's own server image with a start script that writes
# its config from Railway's variables. TCP only, since Railway has no UDP;
# socat carries the proxied port onto the one LiveKit advertises.
FROM livekit/livekit-server:latest
USER root
RUN apk add --no-cache socat coturn
COPY start.sh /start.sh
RUN chmod +x /start.sh
ENTRYPOINT ["/start.sh"]
