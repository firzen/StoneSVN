#!/bin/sh
# Expose the lowercase `orcasvn` command next to the bundled /usr/bin/OrcaSVN binary.
if [ -x /usr/bin/OrcaSVN ] && [ ! -e /usr/bin/orcasvn ]; then
  ln -s /usr/bin/OrcaSVN /usr/bin/orcasvn
fi
exit 0
