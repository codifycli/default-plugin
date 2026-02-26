import {
  CreatePlan,
  DestroyPlan,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z,
  ParameterChange, ModifyPlan
} from '@codifycli/plugin-core';
import { OS } from 'codify-schemas';

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
});

export type TartVmConfig = z.infer<typeof schema>;

export class TartVmResource extends Resource<TartVmConfig> {
  getSettings(): ResourceSettings<TartVmConfig> {
    return {
      id: 'tart-vm',
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
