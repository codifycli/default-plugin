import { Plugin, runPlugin } from '@codifycli/plugin-core';
import { AndroidStudioResource } from './resources/android/android-studio.js';
import { AptResource } from './resources/apt/apt.js';
import { AsdfResource } from './resources/asdf/asdf.js';
import { AsdfInstallResource } from './resources/asdf/asdf-install.js';
import { AsdfPluginResource } from './resources/asdf/asdf-plugin.js';
import { AwsCliResource } from './resources/aws-cli/cli/aws-cli.js';
import { AwsProfileResource } from './resources/aws-cli/profile/aws-profile.js';
import { DnfResource } from './resources/dnf/dnf.js';
import { GoenvResource } from './resources/go/goenv/goenv.js';
import { DockerResource } from './resources/docker/docker.js';
import { EnvFileResource } from './resources/file/env-file/env-file-resource.js';
import { EnvFilesResource } from './resources/file/env-file/env-files-resource.js';
import { FileResource } from './resources/file/file.js';
import { RemoteFileResource } from './resources/file/remote-file.js';
import { GitResource } from './resources/git/git/git-resource.js';
import { GitLfsResource } from './resources/git/lfs/git-lfs.js';
import { GitRepositoriesResource } from './resources/git/repositories/git-repositories.js';
import { GitRepositoryResource } from './resources/git/repository/git-repository.js';
import { WaitGithubSshKey } from './resources/git/wait-github-ssh-key/wait-github-ssh-key.js';
import { HomebrewResource } from './resources/homebrew/homebrew.js';
import { JenvResource } from './resources/java/jenv/jenv.js';
import { Npm } from './resources/javascript/npm/npm.js';
import { NpmLoginResource } from './resources/javascript/npm/npm-login.js';
import { FnmResource } from './resources/javascript/fast-node-manager/fast-node-manager.js';
import { NvmResource } from './resources/javascript/nvm/nvm.js';
import { Pnpm } from './resources/javascript/pnpm/pnpm.js';
import { MacosSettingsResource } from './resources/macos/macos-settings/macos-settings-resource.js';
import { MacportsResource } from './resources/macports/macports.js';
import { ClaudeCodeResource } from './resources/claude-code/claude-code.js';
import { ClaudeCodeProjectResource } from './resources/claude-code/claude-code-project.js';
import { CodexResource } from './resources/codex/codex.js';
import { CodexProjectResource } from './resources/codex/codex-project.js';
import { CodexAppResource } from './resources/codex/codex-app.js';
import { OllamaResource } from './resources/ollama/ollama.js';
import { PgcliResource } from './resources/pgcli/pgcli.js';
import { Pip } from './resources/python/pip/pip.js';
import { PipSync } from './resources/python/pip-sync/pip-sync.js';
import { PyenvResource } from './resources/python/pyenv/pyenv.js';
import { UvResource } from './resources/python/uv/uv.js';
import { VenvProject } from './resources/python/venv/venv-project.js';
import { Virtualenv } from './resources/python/virtualenv/virtualenv.js';
import { VirtualenvProject } from './resources/python/virtualenv/virtualenv-project.js';
import { RbenvResource } from './resources/ruby/rbenv/rbenv.js';
import { ActionResource } from './resources/scripting/action.js';
import { AliasResource } from './resources/shell/alias/alias-resource.js';
import { AliasesResource } from './resources/shell/aliases/aliases-resource.js';
import { EnvVarResource } from './resources/shell/env-var/env-var-resource.js';
import { EnvVarsResource } from './resources/shell/env-vars/env-vars-resource.js';
import { PathResource } from './resources/shell/path/path-resource.js';
import { SnapResource } from './resources/snap/snap.js';
import { SyncthingResource } from './resources/syncthing/syncthing.js';
import { SyncthingDeviceResource } from './resources/syncthing/syncthing-device.js';
import { SyncthingFolderResource } from './resources/syncthing/syncthing-folder.js';
import { SshAddResource } from './resources/ssh/ssh-add.js';
import { SshConfigFileResource } from './resources/ssh/ssh-config.js';
import { SshKeyResource } from './resources/ssh/ssh-key.js';
import { TartResource } from './resources/tart/tart.js';
import { TartVmResource } from './resources/tart/tart-vm.js';
import { TerraformResource } from './resources/terraform/terraform.js';
import { CursorResource } from './resources/cursor/cursor.js';
import { VscodeResource } from './resources/vscode/vscode.js';
import { WebStormResource } from './resources/webstorm/webstorm.js';
import { XcodeToolsResource } from './resources/xcode-tools/xcode-tools.js';
import { YumResource } from './resources/yum/yum.js';

export const MIN_SUPPORTED_CLI_VERSION: string | undefined = '1.1.0';

runPlugin(Plugin.create(
  'default',
  [
    new GitResource(),
    new XcodeToolsResource(),
    new PathResource(),
    new AliasResource(),
    new AliasesResource(),
    new EnvVarResource(),
    new EnvVarsResource(),
    new HomebrewResource(),
    new PyenvResource(),
    new UvResource(),
    new GitLfsResource(),
    new AwsCliResource(),
    new AwsProfileResource(),
    new TerraformResource(),
    new NvmResource(),
    new FnmResource(),
    new JenvResource(),
    new GoenvResource(),
    new PgcliResource(),
    new CursorResource(),
    new VscodeResource(),
    new WebStormResource(),
    new GitRepositoryResource(),
    new GitRepositoriesResource(),
    new AndroidStudioResource(),
    new AsdfResource(),
    new AsdfPluginResource(),
    new AsdfInstallResource(),
    new SshKeyResource(),
    new SshConfigFileResource(),
    new SshAddResource(),
    new ActionResource(),
    new FileResource(),
    new RemoteFileResource(),
    new EnvFileResource(),
    new EnvFilesResource(),
    new Virtualenv(),
    new VirtualenvProject(),
    new Pnpm(),
    new WaitGithubSshKey(),
    new VenvProject(),
    new Pip(),
    new PipSync(),
    new MacportsResource(),
    new MacosSettingsResource(),
    new Npm(),
    new NpmLoginResource(),
    new DockerResource(),
    new AptResource(),
    new YumResource(),
    new DnfResource(),
    new SnapResource(),
    new TartResource(),
    new TartVmResource(),
    new ClaudeCodeResource(),
    new ClaudeCodeProjectResource(),
    new CodexResource(),
    new CodexProjectResource(),
    new CodexAppResource(),
    new OllamaResource(),
    new SyncthingResource(),
    new SyncthingDeviceResource(),
    new SyncthingFolderResource(),
    new RbenvResource(),
  ],
  { minSupportedCliVersion: MIN_SUPPORTED_CLI_VERSION }
))
