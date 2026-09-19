#!/bin/sh
# Writes LiveKit's config from variables and starts the server.
#
#   LIVEKIT_API_KEY, LIVEKIT_API_SECRET   the pair the API signs tokens with
#   REDIS_URL                             the project's Redis
#   PORT                                  the signalling port (7880)
#   RAILWAY_TCP_PROXY_DOMAIN, _PORT,      set by Railway once the service has
#   RAILWAY_TCP_APPLICATION_PORT          a TCP proxy for its media port
#   TURN_DOMAIN, TURN_SECRET              the name browsers reach TURN on
#                                         (it points at the proxy) and the
#                                         shared secret coturn checks
#
# Browsers offer no ICE candidate over TCP, so without UDP a browser only
# reaches the room through TURN. Railway allows one TCP proxy a service,
# so with TURN configured the proxied port is TURN's (coturn, plain TCP),
# and ICE over TCP moves to a port only the private network sees, which
# is where the tutor agent dials in from.
#
# Railway has no UDP, so every call rides ICE over TCP. A browser reaches
# the media port through Railway's TCP proxy, public host:port onto the
# application port, and an ICE candidate must name the public port. So
# LiveKit listens on the public port number itself, advertises the proxy's
# IP, and socat carries the application port onto it inside the container.
set -e
: "${PORT:=7880}"
APP_PORT="${RAILWAY_TCP_APPLICATION_PORT:-7881}"
PUBLIC_PORT="${RAILWAY_TCP_PROXY_PORT:-$APP_PORT}"
NODE_IP=""
if [ -n "$RAILWAY_TCP_PROXY_DOMAIN" ]; then
  NODE_IP=$(getent ahostsv4 "$RAILWAY_TCP_PROXY_DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}')
  [ -z "$NODE_IP" ] && NODE_IP=$(getent hosts "$RAILWAY_TCP_PROXY_DOMAIN" 2>/dev/null | awk '{print $1; exit}')
fi
TURN=""
if [ -n "$TURN_DOMAIN" ] && [ -n "$TURN_SECRET" ]; then
  # LiveKit advertises its own TURN on 443 whatever tls_port says, and
  # Railway cannot give us 443. An external TURN is advertised as
  # configured, so coturn runs here on the proxied port, plain TURN over
  # TCP, and relays onto LiveKit's own UDP ports on this host.
  TURN="on"
  TURN_PORT="$PUBLIC_PORT"
  ICE_PORT=7882
  turnserver -n --listening-port="$APP_PORT" --listening-ip=0.0.0.0 --no-udp --no-tls --no-dtls \
    --fingerprint --lt-cred-mech --user="easiread:${TURN_SECRET}" --realm="$TURN_DOMAIN" \
    --min-port=30000 --max-port=40000 --no-cli --log-file=stdout --simple-log &
else
  ICE_PORT="$PUBLIC_PORT"
  [ "$APP_PORT" != "$ICE_PORT" ] && socat TCP-LISTEN:"$APP_PORT",fork,reuseaddr TCP:127.0.0.1:"$ICE_PORT" &
fi
REDIS_ADDR=""; REDIS_PASS=""
if [ -n "$REDIS_URL" ]; then
  REDIS_ADDR=$(echo "$REDIS_URL" | sed -E 's#^redis://##; s#^[^@]*@##')
  REDIS_PASS=$(echo "$REDIS_URL" | sed -nE 's#^redis://[^:]*:([^@]*)@.*#\1#p')
fi
{
  echo "port: ${PORT}"
  echo "rtc:"
  echo "  tcp_port: ${ICE_PORT}"
  echo "  port_range_start: 50000"
  echo "  port_range_end: 50010"
  echo "  use_external_ip: false"
  # The private address too, so the tutor agent on the same network dials
  # straight in, UDP and all, without going round through the proxy.
  echo "  advertise_internal_ip: true"
  [ -n "$NODE_IP" ] && echo "  node_ip: ${NODE_IP}"
  if [ -n "$TURN" ]; then
    echo "  turn_servers:"
    echo "    - host: ${TURN_DOMAIN}"
    echo "      port: ${TURN_PORT}"
    echo "      protocol: tcp"
    echo "      username: easiread"
    echo "      credential: ${TURN_SECRET}"
  fi
  echo "keys:"
  echo "  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"
  if [ -n "$REDIS_ADDR" ]; then
    echo "redis:"
    echo "  address: ${REDIS_ADDR}"
    [ -n "$REDIS_PASS" ] && echo "  password: ${REDIS_PASS}"
  fi

  echo "logging:"
  echo "  level: info"
} > /tmp/livekit.yaml
echo "livekit: signalling on ${PORT}, media over TCP ${ICE_PORT} (app port ${APP_PORT}), advertised ${NODE_IP:-<own ip>}, turn ${TURN:-off}${TURN:+ at ${TURN_DOMAIN}:${TURN_PORT}}"
exec /livekit-server --config /tmp/livekit.yaml
