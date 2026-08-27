# 内网部署

当前版本定位为一版内网工具，staging 可通过 HTTP 直连使用；域名和 HTTPS 不作为本阶段部署前置条件。若未来开放公网访问，必须另行完成 HTTPS、访问控制、密钥保管和流量切换设计。

## 腾讯云 Docker 镜像源

腾讯云云服务器在内网可使用以下 Docker Hub 镜像加速地址：

```text
https://mirror.ccs.tencentyun.com
```

该地址仅支持腾讯云内网访问，不支持外网域名访问加速。详细限制和其他系统配置方式请参阅[腾讯云官方说明](https://cloud.tencent.com/document/product/213/8623)。

Ubuntu 22.04 / CentOS 7 可通过以下方式配置：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com"
  ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
docker info | sed -n '/Registry Mirrors:/,/Live Restore Enabled/p'
```

镜像源只负责加速基础镜像下载，不会改变应用本身的访问协议。配置完成后再执行 `docker build`，并在隔离端口验证 `/api/health` 与 `/api/ready`。

## 相关运行文档

- [v1.12 生产运行手册](v1.12/PRODUCTION_RUNBOOK.md)
- [备份与恢复](v1.12/BACKUP_RESTORE.md)
- [稳定性基线](STABILITY_BASELINE_20260828.md)
