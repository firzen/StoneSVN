#!/bin/sh
# Expose the lowercase `stonesvn` command next to the bundled /usr/bin/StoneSVN binary.
if [ -x /usr/bin/StoneSVN ] && [ ! -e /usr/bin/stonesvn ]; then
  ln -s /usr/bin/StoneSVN /usr/bin/stonesvn
fi
exit 0
