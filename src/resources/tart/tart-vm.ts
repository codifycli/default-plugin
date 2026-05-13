import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z,
  ParameterChange, ModifyPlan
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

const schema = z.object({
  sourceName: z
    .string()
    .describe('The source of the image (an OCI registry)'),
  localName: z
    .string()
    .describe('The local name of the image'),
  memory: z
    .number()
    .describe('Sets the memory of the vm in MB using tart set <vm-name> --memory')
    .optional(),
  cpu: z
    .number()
    .describe('Sets the cpu count of the vm using tart set <vm-name> --cpu')
    .optional(),
  display: z
    .string()
    .describe('Sets the display size in format <width>x<height>. For example 1200x800')
    .optional(),
  diskSize: z
    .number()
    .describe('The disk size in GB. Disk size can only be increased and not decreased')
    .optional(),
}).meta({ $comment: 'https://codifycli.com/docs/resources/tart/tart-vm' });

export type TartVmConfig = z.infer<typeof schema>;

const defaultConfig: Partial<TartVmConfig> & { os: any } = {
  sourceName: '<Replace me here!>',
  localName: '<Replace me here!>',
  os: ['macOS'],
}

const exampleBasic: ExampleConfig = {
  title: 'Pull a macOS VM image',
  description: 'Clone a macOS Sequoia base image from the Cirrus Labs registry and store it locally.',
  configs: [{
    type: 'tart-vm',
    sourceName: 'ghcr.io/cirruslabs/macos-sequoia-base:latest',
    localName: 'sequoia',
    os: ['macOS'],
  }]
}

const exampleWithTart: ExampleConfig = {
  title: 'Install Tart and pull a macOS VM',
  description: 'Install Tart and clone a macOS Sequoia VM image ready to run locally.',
  configs: [
    {
      type: 'tart',
      os: ['macOS'],
    },
    {
      type: 'tart-vm',
      sourceName: 'ghcr.io/cirruslabs/macos-sequoia-base:latest',
      localName: 'sequoia',
      cpu: 4,
      memory: 8192,
      os: ['macOS'],
      dependsOn: ['tart'],
    },
  ]
}

export class TartVmResource extends Resource<TartVmConfig> {
  getSettings(): ResourceSettings<TartVmConfig> {
    return {
      id: 'tart-vm',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleWithTart,
      },
      operatingSystems: [OS.Darwin],
      dependencies: ['tart'],
      schema,
      parameterSettings: {
        diskSize: { type: 'number', canModify: true },
        memory: { type: 'number', canModify: true },
        cpu: { type: 'number', canModify: true },
        display: { type: 'string', canModify: true },
      },
    };
  }

  async refresh(parameters: Partial<TartVmConfig>): Promise<Partial<TartVmConfig> | null> {
    const $ = getPty();

    // Check if tart is installed
    const { status: tartStatus } = await $.spawnSafe('which tart');
    if (tartStatus !== SpawnStatus.SUCCESS) {
      return null;
    }

    // List all VMs
    const { status, data } = await $.spawnSafe('tart list --format json');
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    // Check if the VM exists
    // Parse the JSON output to get the list of VMs
    try {
      const vmList = JSON.parse(data);
      if (!vmList.some((vm: { Name: string }) => vm.Name === parameters.localName)) {
        return null;
      }
    } catch(e) {
      console.error('Error parsing JSON:', e);

      // If JSON parsing fails, return null
      return null;
    }

    const result: Partial<TartVmConfig> = {
      localName: parameters.localName,
      sourceName: parameters.sourceName,
    }

    try {
      // Get VM configuration using tart get
      const { status: getStatus, data: getData } = await $.spawnSafe(`tart get ${parameters.localName} --format json`);

      if (getStatus === SpawnStatus.SUCCESS) {
        // Parse the output to extract configuration

        const vmInfo = JSON.parse(getData);
        result.memory = vmInfo.Memory;
        result.cpu = vmInfo.CPU;
        result.display = vmInfo.Display;
        result.diskSize = vmInfo.Disk;
      }
    } catch {
      // If JSON parsing fails, return null
      return result;
    }

    return result;
  }

  async create(plan: CreatePlan<TartVmConfig>): Promise<void> {
    const $ = getPty();

    // Determine the VM name
    const vmName = plan.desiredConfig.localName;

    if (!vmName) {
      throw new Error('Unable to determine VM name. Please provide either "name" or a valid "sourceName"');
    }

    // Clone the VM
    await $.spawn(`tart clone ${plan.desiredConfig.sourceName} ${vmName}`, { interactive: true });

    // Set VM parameters if specified
    const setCommands: string[] = [];

    if (plan.desiredConfig.memory) {
      setCommands.push(`--memory ${plan.desiredConfig.memory}`);
    }

    if (plan.desiredConfig.cpu) {
      setCommands.push(`--cpu ${plan.desiredConfig.cpu}`);
    }

    if (plan.desiredConfig.display) {
      setCommands.push(`--display ${plan.desiredConfig.display}`);
    }

    if (plan.desiredConfig.diskSize) {
      setCommands.push(`--disk-size ${plan.desiredConfig.diskSize}`);
    }

    if (setCommands.length > 0) {
      await $.spawn(`tart set ${vmName} ${setCommands.join(' ')}`, { interactive: true });
    }
  }

  async modify(pc: ParameterChange<TartVmConfig>, plan: ModifyPlan<TartVmConfig>): Promise<void> {
    const $ = getPty();

    // Set VM parameters if specified
    const setCommands: string[] = [];

    if (plan.desiredConfig.memory) {
      setCommands.push(`--memory ${plan.desiredConfig.memory}`);
    }

    if (plan.desiredConfig.cpu) {
      setCommands.push(`--cpu ${plan.desiredConfig.cpu}`);
    }

    if (plan.desiredConfig.display) {
      setCommands.push(`--display ${plan.desiredConfig.display}`);
    }

    if (plan.desiredConfig.diskSize) {
      setCommands.push(`--disk-size ${plan.desiredConfig.diskSize}`);
    }

    if (setCommands.length > 0) {
      await $.spawn(`tart set ${plan.desiredConfig.localName} ${setCommands.join(' ')}`, { interactive: true });
    }
  }

  async destroy(plan: DestroyPlan<TartVmConfig>): Promise<void> {
    const $ = getPty();

    // Determine the VM name
    const vmName = plan.currentConfig.localName;

    if (!vmName) {
      throw new Error('Unable to determine VM name');
    }

    // Delete the VM
    await $.spawnSafe(`tart delete ${vmName}`, { interactive: true });
  }
}
