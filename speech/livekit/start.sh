#!/bin/sh
# Writes LiveKit's config from variables and starts the server.
#
#   LIVEKIT_API_KEY, LIVEKIT_API_SECRET   the pair the API signs tokens with
#   REDIS_URL                             the project's Redis
#   PORT                                  the signalling port (7880)
#   RAILWAY_TCP_PROXY_DOMAIN, _PORT,      set by Railway once the service has
#   RAILWAY_TCP_APPLICATION_PORT          a TCP proxy for its media port
#
# Railway has no UDP, so every call rides ICE over TCP. A browser reaches
# the media port through Railway's TCP proxy, public host:port onto the
# application port, and an ICE candidate must name the public port. So
# LiveKit listens on the public port number itself, advertises the proxy's
# IP, and socat carries the application port onto it inside the container.
set -e
: "${PORT:=7880}"
APP_PORT="${RAILWAY_TCP_APPLICATION_PORT:-7881}"
ICE_PORT="${RAILWAY_TCP_PROXY_PORT:-$APP_PORT}"
NODE_IP=""
if [ -n "$RAILWAY_TCP_PROXY_DOMAIN" ]; then
  NODE_IP=$(getent ahostsv4 "$RAILWAY_TCP_PROXY_DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}')
  [ -z "$NODE_IP" ] && NODE_IP=$(getent hosts "$RAILWAY_TCP_PROXY_DOMAIN" 2>/dev/null | awk '{print $1; exit}')
fi
if [ "$APP_PORT" != "$ICE_PORT" ]; then
  socat TCP-LISTEN:"$APP_PORT",fork,reuseaddr TCP:127.0.0.1:"$ICE_PORT" &
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
echo "livekit: signalling on ${PORT}, media over TCP ${ICE_PORT} (app port ${APP_PORT}), advertised ${NODE_IP:-<own ip>}"
exec /livekit-server --config /tmp/livekit.yaml
