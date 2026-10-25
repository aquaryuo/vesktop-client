import { plugins } from "@api/PluginManager";
import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

const OWNER = 975151124824879125n;
const OWNER_ID = String(OWNER);
const BUILT_IN = "-1";

interface Section {
    section: { id: string; };
    data: { plugin?: string; }[];
}

const SECTION = {
    id: "vc-aquaryuo",
    type: 1,
    icon: null,
    isUserApp: false,
    get name() {
        const user = UserStore.getUser(OWNER_ID);
        return user?.globalName || user?.username || "aquaryuo";
    },
    get application() {
        return { id: SECTION.id, name: SECTION.name, bot: UserStore.getUser(OWNER_ID) };
    }
};

const BROWSER_ROW = Object.create(SECTION);

interface Row {
    command?: { plugin?: string; };
    section?: unknown;
    showImage?: boolean;
}

const isMine = ({ plugin }: { plugin?: string; }) => !!plugin && !!plugins[plugin]?.authors.some(a => a.id === OWNER);

export default definePlugin({
    name: "MyCommands",
    description: "Puts the commands from aquaryuo's plugins in their own section, with aquaryuo's picture",
    authors: [{ name: "aquaryuo", id: OWNER }],
    enabledByDefault: true,
    patches: [
        {
            find: "Failed to select application descriptor",
            replacement: {
                match: /(\i)\.length>0\|\|!0===\i\)\{let (\i)=\i\(\i\.\i\[\i\.\i\.BUILT_IN\],\1,!0,!0,\i\);null!=\2&&(\i)\.push\(\2\)\}/,
                replace: "$&$self.split($3);"
            }
        },
        {
            find: "placeholderCount:7,limit:",
            replacement: [
                {
                    match: /(\i)\.section\.id!==(\i)\.applicationId/g,
                    replace: "$self.sectionId($1.section)!==$2.applicationId"
                },
                {
                    match: /(command:(\i),[^}]{0,200}?showImage:[^,]+,section:)(\i)/,
                    replace: "$1$self.rowSection($2,$3)"
                }
            ]
        },
        {
            find: "#{intl::COMMANDS_OPTIONAL_COUNT}",
            replacement: {
                match: /(\{command:\i,activeOptionName:\i,[^}]*\}=)(\i)(?=,)/,
                replace: "$1$self.rowProps($2)"
            }
        }
    ],

    split(sections: Section[]) {
        const builtIn = sections.find(s => s.section.id === BUILT_IN);
        const mine = builtIn?.data.filter(isMine) ?? [];
        if (!builtIn || !mine.length) return;
        builtIn.data = builtIn.data.filter(c => !isMine(c));
        sections.splice(sections.indexOf(builtIn), builtIn.data.length ? 0 : 1, { section: SECTION, data: mine });
    },

    sectionId(section: { id: string; }) {
        return section.id === SECTION.id ? BUILT_IN : section.id;
    },

    rowSection(command: { plugin?: string; }, section: unknown) {
        return isMine(command) ? BROWSER_ROW : section;
    },

    rowProps(props: Row) {
        if (!props.command || !isMine(props.command)) return props;
        return props.section === BROWSER_ROW ? { ...props, section: SECTION } : { ...props, showImage: true, section: SECTION };
    }
});
