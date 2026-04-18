import { Shell, SpawnStatus, VerbosityLevel } from '@codifycli/plugin-core';
import { testSpawn, TestUtils } from '@codifycli/plugin-test';
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import * as inspector from 'node:inspector';
import os from 'node:os';
import path from 'node:path';

import { codifySpawn } from '../src/utils/codify-spawn';

const IP_REGEX = /VM was assigned with (.*) IP/;

const program = new Command();

program
  .option('--launchPersistent', 'Launches a persistent VM for testing', false)
  .option('--operatingSystem <operatingSystem>', 'Operating system to run tests on', os.platform())
  .option('--persistent', 'Runs tests on a persistent VM (reuse) to skip the overhead of launching a new VM each time', false)
  .argument('[file]', 'File to run')
  .action(main)
  .parse()

async function main(argument: string, args: {
  operatingSystem: string;
  persistent: boolean;
  launchPersistent: boolean
}): Promise<void> {
  const debug = isInDebugMode();
  if (debug) {
    console.log('Running in debug mode!')
  }

  if (args.launchPersistent) {
    await launchPersistentVm(args.operatingSystem);
    return process.exit(0);
  }

  if (args.persistent) {
    if (!argument) {
      throw new Error('No test specified for persistent mode');
    }

    await launchPersistentTest(argument, debug, args.operatingSystem);
    return process.exit(0);
  }

  if (!argument) {
    await launchTestAll(debug, args.operatingSystem)
    return process.exit(0);
  }

  await launchSingleTest(argument, debug, args.operatingSystem);
  process.exit(0);
}

async function launchTestAll(debug: boolean, operatingSystem: string): Promise<void> {
  const image = operatingSystem === 'darwin' ? 'integration_test_dev_macos' : 'integration_test_dev_linux';

  // const tests = await glob('./test/**/*.test.ts');
  // for (const test of tests) {
  //   console.log(`Running test ${test}`)
  //   await run(`cirrus run --lazy-pull ${image} -e FILE_NAME="${test}" ${ debug ? '-o simple' : ''}`, debug, false)
  // }

  await run(`cirrus run --lazy-pull ${image} -o simple`, debug, false);
}

async function launchSingleTest(test: string, debug: boolean, operatingSystem: string) {
  const image = operatingSystem === 'darwin' ? 'integration_individual_test_macos' : 'integration_individual_test_linux';

  console.log(`Running test: ${test}`)
  await run(`cirrus run --lazy-pull ${image} -e FILE_NAME="${test}" -o simple`, debug)
}

async function launchPersistentTest(test: string, debug: boolean, operatingSystem: string) {
  const shell = operatingSystem === 'darwin' ? 'zsh' : 'bash';

  // if (operatingSystem === 'darwin') {
  const { data: vmList } = await codifySpawn('tart list --format json');
  console.log(vmList);

  const parsedVmList = JSON.parse(vmList);
  const runningVm = parsedVmList.find(vm => vm.Name.startsWith('codify-test-vm') && vm.Running === true);
  if (!runningVm) {
    throw new Error('No persistent VM found');
  }

  const vmName = runningVm.Name;
  const dir = '~/codify-homebrew-plugin';
  // const dir = '/Volumes/My\\ Shared\\ Files/plugin'

  const debugFlag = debug ? ' -e DEBUG="--inspect-brk=9229"' : ''

  console.log('Refreshing files on VM...');
  const { data: ipAddr } = await testSpawn(`tart ip ${vmName}`);
  await testSpawn(`tart exec ${vmName} rm -rf ${dir}/src ${dir}/test`, { throws: true });
  await testSpawn(`sshpass -p "admin" scp -r -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${path.join(process.cwd(), 'test')} ${path.join(process.cwd(), 'src')} ${path.join(process.cwd(), 'package.json')} ${path.join(process.cwd(), 'package-lock.json')} admin@${ipAddr}:${dir}`, { throws: true });

  console.log('Done refreshing files on VM. Starting tests...');
  VerbosityLevel.set(3);
  await codifySpawn(`tart exec ${vmName} ${shell} -c ${operatingSystem === 'darwin' ? '-i' : ''} "cd ${dir} && FORCE_COLOR=true npm run test -- ${test} --disable-console-intercept ${debugFlag} --no-file-parallelism"`, { throws: false });
  // }
}

async function launchPersistentVm(operatingSystem: string) {
  const newVmName = `codify-test-vm-${Date.now()}`;
  const shell = operatingSystem === 'darwin' ? 'zsh' : 'bash';

  console.log(`Cloning new VM... ${newVmName}`);

  const image = (operatingSystem === 'darwin') ? 'codify-test-vm' : 'codify-test-vm-linux';
  await testSpawn(`tart clone ${image} ${newVmName}`);
  testSpawn(`tart run ${newVmName}`)
    .then(cleanupVm)

  process.on('exit', cleanupVm);
  process.on('SIGINT', cleanupVm);
  process.on('SIGHUP', cleanupVm);
  process.on('SIGTERM', cleanupVm);

  await sleep(5000);
  await waitUntilVmIsReady(newVmName);

  const { data: ipAddr } = await testSpawn(`tart ip ${newVmName}`);
  await testSpawn(`sshpass -p "admin" rsync -avz -e 'ssh -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null' --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude '.fleet' ${process.cwd()} admin@${ipAddr}:~`);
  if (operatingSystem === 'darwin') {
    await testSpawn(`tart exec ${newVmName} ${shell} -i -c "mv ~/.zprofile ~/.zshenv"`);
  }

  await testSpawn(`tart exec ${newVmName} ${shell} -i -c "cd ~/codify-homebrew-plugin && npm ci"`);
  console.log('Finished installing dependencies. Start tests in a new terminal window.');

  await sleep(1_000_000_000);

  // This is effective the end just without a return

  async function cleanupVm() {
    console.log('Deleting VM after...')
    await testSpawn(`tart delete ${newVmName}`);
    process.exit(0);
  }
}

async function run(cmd: string, debug: boolean, simple = true) {
  const messageBuffer: string[] = [];

  cmd += (debug ? ' -e DEBUG="--inspect-brk=9229"' : '');
  const cp = spawn(
    'source ~/.zshrc; ' + cmd,
    [],
    { stdio: simple || debug ? 'pipe' : 'inherit', shell: 'zsh' });

  cp.stderr?.on('data', data => {
    console.log(data.toString());
    messageBuffer.push(data.toString());
  });
  cp.stdout?.on('data', data => {
    console.log(data.toString());
    messageBuffer.push(data.toString());
  });

  // If debug then open ssh tunnel
  // if (debug) {
  //   cp.stdout!.on('data', data => {
  //     if (data.toString().includes('VM was assigned with')) {
  //       const [_, ip] = data.toString().match(IP_REGEX);
  //
  //       console.log(`Copying ssh keys to ${ip}`)
  //       // spawnSync(`source $HOME/.zshrc; sshpass -p admin ssh-copy-id -o "StrictHostKeyChecking=no" admin@${ip}`, { stdio: 'inherit', shell: 'zsh' });
  //
  //       console.log('Enabling port forwarding')
  //       const sshStatement1 = `ssh${ Array.from({ length: 20 }, (i: number) => i + 9000).map((i) => ` -L ${i}:localhost:${i}`)} admin@${ip}`;
  //       const sshStatement2 = `source $HOME/.zshrc; sshpass -p admin ssh -L 9221:localhost:9221 -L 9229:localhost:9229 -N -o "StrictHostKeyChecking=no" admin@${ip}`
  //
  //       const portForward1 = spawn(sshStatement2, { stdio: 'pipe', shell: 'zsh' });
  //       portForward1.stderr.pipe(process.stdout)
  //       portForward1.stdout.on('data', data => {
  //         console.log(data.toString());
  //         if (data.toString().includes('Address already in use')) {
  //           throw new Error('Port 9229 already in use!')
  //         }
  //       })
  //       // console.log('Enabled on port 9229')
  //
  //       // const portForward2 = spawn(`ssh -L 9221:localhost:9221 -Nf admin@${ip}`, { stdio: 'pipe', shell: 'zsh' });
  //       // portForward2.stdout.on('data', data => {
  //       //   console.log(data.toString());
  //       //   if (data.toString().includes('Address already in use')) {
  //       //     throw new Error('Port 9221 already in use!')
  //       //   }
  //       // });
  //       // console.log('Enabled on port 9221')
  //     }
  //   })
  // }

  return new Promise((resolve) =>
    cp.on('exit', () => resolve(messageBuffer.join('\n'))) // We never want to reject here even if the test fails
  );

}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isInDebugMode() {
  return inspector.url() !== undefined;
}


async function waitUntilVmIsReady(vmName: string): Promise<void> {
  while (true) {
    const result = await testSpawn(`tart exec ${vmName} pwd`, { interactive: true })
    if (result.status === SpawnStatus.SUCCESS) {
      return;
    }

    await sleep(1000);
  }
}
