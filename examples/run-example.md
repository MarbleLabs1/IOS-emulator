# Example: install Debian ARM64 in a VM

```bash
# 1. Download an ARM64 installer ISO (netinst) from debian.org, then:
linux-emulator-server/src/scripts/enhanced-run.sh \
  --name debian --iso ~/Downloads/debian-arm64-netinst.iso \
  --memory 4G --cpus 4 --vnc :1 --ssh-port 2223

# 2. Connect a VNC client to 127.0.0.1:5901 and finish the installer.
# 3. Restart without --iso to boot from the installed disk.
```

Or do the same from the dashboard (the ISO option is available from the script only).
