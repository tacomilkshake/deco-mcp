# Image maintenance policy

Use maintained upstream releases and supported base distributions.
Keep application dependencies in reviewed lock files. Preserve upstream compatibility constraints.
Build and install tools belong to image construction. Production containers run the installed application and do not install packages at startup.

Tests exercise the actual candidate image. Source and revision labels identify its inputs.
CI scans the candidate before publication and blocks high or critical findings with an available fix.
Retain all findings, including those without a distribution fix, for review.
Do not suppress a finding without a package-specific vendor assessment and a review date.
A green pipeline does not establish that every scanner finding is exploitable or resolved.

Weekly rebuilds detect changes in OS packages and vulnerability data.
Dependabot opens source changes for review. Each successful release has an immutable identity.
Installations select tested artifacts and keep the prior image and state for rollback.
