import restoreListImpl from "./restoreListImpl";
import { NullStateProvider } from "./stateProvider";

async function run(): Promise<void> {
    await restoreListImpl(new NullStateProvider());
}

run();

export default run;
