/**
 * Which fields the grid's records actually carry.
 *
 * A Get Records element can "Choose fields and let Salesforce do the rest",
 * and then only those fields are queried. A column on any other field fails at
 * run time, so the Studio's field list offers only what the source retrieves.
 *
 * Pure: reads the Records reference and Flow Builder's `builderContext`, and
 * returns where the records come from and which fields they hold. The shape of
 * `builderContext.recordLookups` follows the Flow metadata -- `name`, `object`,
 * `queriedFields`, `storeOutputAutomatically`, `outputReference` -- which the
 * Flow Config Editor Kit reads the same way. `queriedFields` is parsed
 * defensively, as strings or `{ name }` / `{ value }` objects, because how
 * Flow Builder serializes it into the context has not been measured.
 */

/** How far a Filter or Sort chain is followed before giving up. */
const MAX_HOPS = 10;

/** `{!Get_Accounts}` or `Get_Accounts`, to the element or variable name. */
export function referenceName(value) {
    if (typeof value !== "string") {
        return "";
    }
    const trimmed = value.trim();
    const match = /^\{!\s*([^}]+?)\s*\}$/.exec(trimmed);
    return match ? match[1] : trimmed;
}

/**
 * Where the records come from and which fields they carry.
 *
 * `fields` is null when every field is available -- a Get Records that stores
 * all fields, or a source this cannot see into, such as a loop or a plain
 * collection variable, where guessing a restriction would hide real fields.
 * Otherwise it is the queried fields plus Id, which a query always returns.
 *
 * `fromGetRecords` is true when the source was traced to a Get Records. Such
 * records never carry parent fields -- not even when all fields are stored --
 * so a relationship path like Owner.Name is always empty there.
 */
export function retrievedFields(recordsValue, builderContext) {
    const context = builderContext || {};
    let name = referenceName(recordsValue);
    if (!name) {
        return { sourceLabel: "", fields: null, fromGetRecords: false };
    }
    const requested = name;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
        const lookup = findLookup(context, name);
        if (lookup) {
            const queried = queriedFieldNames(lookup);
            return {
                sourceLabel: lookup.label || lookup.name || requested,
                fields: queried.length ? [...new Set(["Id", ...queried])] : null,
                fromGetRecords: true
            };
        }
        const processor = findProcessor(context, name);
        if (!processor?.collectionReference) {
            break;
        }
        // A Filter or Sort keeps its input's records, fields and all.
        name = referenceName(processor.collectionReference);
    }
    return { sourceLabel: requested, fields: null, fromGetRecords: false };
}

/** The Get Records element with this name, or the one that stores into it. */
function findLookup(context, name) {
    const lookups = asArray(context.recordLookups);
    return (
        lookups.find((lookup) => (lookup?.name || lookup?.apiName) === name) ||
        lookups.find((lookup) => referenceName(lookup?.outputReference) === name)
    );
}

/** A Collection Filter or Sort element by name. */
function findProcessor(context, name) {
    return asArray(context.collectionProcessors).find((candidate) => (candidate?.name || candidate?.apiName) === name);
}

function queriedFieldNames(lookup) {
    return asArray(lookup.queriedFields)
        .map((entry) => (typeof entry === "string" ? entry : entry?.name || entry?.value || entry?.field))
        .filter((entry) => typeof entry === "string" && entry.trim())
        .map((entry) => entry.trim());
}

function asArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    return value === undefined || value === null ? [] : [value];
}
