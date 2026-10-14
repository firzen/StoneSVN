#!/bin/sh
# Remove the `orcasvn` link once the binary it points to is gone (skips upgrades).
if [ -L /usr/bin/orcasvn ] && [ ! -e /usr/bin/OrcaSVN ]; then
  rm -f /usr/bin/orcasvn
fi
exit 0
