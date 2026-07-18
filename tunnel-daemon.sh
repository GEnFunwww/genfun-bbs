#!/bin/bash
# GENFUN论坛 - Serveo隧道守护脚本
# 自动重连，保持隧道一直活着

PORT=3456
LOG="/tmp/serveo-tunnel.log"

while true; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 正在建立隧道..." | tee -a "$LOG"
    
    ssh -o StrictHostKeyChecking=no \
        -o ServerAliveInterval=30 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes \
        -R 80:localhost:$PORT \
        serveo.net 2>&1 | tee -a "$LOG"
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 隧道断开，5秒后重连..." | tee -a "$LOG"
    sleep 5
done
