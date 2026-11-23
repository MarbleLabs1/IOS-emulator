# Emulator notes

## What runs

`enhanced-run.sh` starts a QEMU `virt` machine (AArch64) with UEFI firmware, a virtio disk, virtio networking, and optionally VNC with a virtio GPU and USB keyboard/tablet. It is meant for ARM64 Linux guests. iOS is not supported.

## Profiles

| Profile | CPU | When to use |
| --- | --- | --- |
| `default` | `cortex-a72` (or `host` with KVM) | Works everywhere |
| `max` | `max` (or `host` with KVM) | Every CPU feature QEMU can emulate |

## Networking

User-mode NAT. Guest port 22 is forwarded to `--ssh-port` (default 2222) on `127.0.0.1`. Use a different `--ssh-port` per VM.

## Snapshots

```bash
enhanced-run.sh --name demo --snapshot save --snapshot-name clean
enhanced-run.sh --name demo --snapshot load --snapshot-name clean
```

Stop the VM before saving or loading a snapshot.

## Troubleshooting

- `AArch64 UEFI firmware not found`: run `make vm-setup` or set `FIRMWARE=/path/to/QEMU_EFI.fd`.
- Very slow guest: you are on a non-ARM host, so QEMU emulates the CPU. Use fewer CPUs and a lightweight distro.
- VM exits right after starting: the API returns the reason, and the full output is in `/var/log/qemu-ios-emulator/<name>.log`.
