'use strict';
// Synthetic local test credentials only. Windows uses ACLs, not POSIX mode bits.
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
async function protectPrivateState(file) {
  if (process.platform !== 'win32') {
    await fs.chmod(file, 0o600);
    if (((await fs.stat(file)).mode & 0o777) !== 0o600) throw Error('PRIVATE_STATE_PERMISSIONS_FAILED');
    return;
  }
  // Use an environment argument, never interpolate a filesystem path into shell code.
  const script = `$ErrorActionPreference='Stop'; $p=$env:JX_PRIVATE_STATE_FILE; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=[System.IO.File]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]::Access); $acl.SetAccessRuleProtection($true,$false); foreach($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }; $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow'); $acl.AddAccessRule($rule); [System.IO.File]::SetAccessControl($p,$acl); $actual=[System.IO.File]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]::Access); if(-not $actual.AreAccessRulesProtected) { throw 'PRIVATE_STATE_INHERITED' }; foreach($r in $actual.Access) { if($r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or $r.AccessControlType -ne 'Allow') { throw 'PRIVATE_STATE_OTHER_ACCESS' } }; if(@($actual.Access).Count -ne 1) { throw 'PRIVATE_STATE_ACCESS_MISSING' }`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, JX_PRIVATE_STATE_FILE: require('node:path').resolve(file) }, windowsHide: true, stdio: 'pipe', timeout: 15000,
  });
}
module.exports = { protectPrivateState };
