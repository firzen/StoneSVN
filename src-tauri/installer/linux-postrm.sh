#!/bin/sh
# Remove the `stonesvn` link once the binary it points to is gone (skips upgrades).
if [ -L /usr/bin/stonesvn ] && [ ! -e /usr/bin/StoneSVN ]; then
  rm -f /usr/bin/stonesvn
fi
exit 0
