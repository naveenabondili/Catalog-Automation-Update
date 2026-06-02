export async function createVariable(client, catalogItemId, variable) {
  console.log("Creating variable:", variable.name);
  
  return {
    sys_id: `var_${Math.random().toString(36).substr(2, 9)}`,
    name: variable.name,
    label: variable.label,
    type: variable.type,
    catalog_item: catalogItemId,
    status: "created"
  };
}

export async function createVariableSet(client, variables) {
  console.log("Creating variable set with", variables.length, "variables");

  const varSet = {
    sys_id: `varset_${Math.random().toString(36).substr(2, 9)}`,
    name: `Variables_${Date.now()}`,
    variables: variables.map(v => ({
      name: v.name,
      label: v.label,
      type: v.type,
      mandatory: v.mandatory || false,
      choices: v.choices || [],
      referenceTable: v.referenceTable || null,
      defaultValue: v.defaultValue || null,
    }))
  };

  return varSet;
}