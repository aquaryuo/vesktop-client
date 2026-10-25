import { plugins } from "@api/PluginManager";
import definePlugin from "@utils/types";
import { IconUtils, UserStore } from "@webpack/common";

const OWNER = 975151124824879125n;
const OWNER_ID = String(OWNER);

interface Section {
    section: { id: string; };
    data: { plugin?: string; }[];
}

const SECTION = {
    id: "vc-aquaryuo",
    type: 0,
    get name() {
        const user = UserStore.getUser(OWNER_ID);
        return user?.globalName || user?.username || "aquaryuo";
    }
};

const isMine = ({ plugin }: { plugin?: string; }) => !!plugin && !!plugins[plugin]?.authors.some(a => a.id === OWNER);

function Avatar({ className, width, height }: { className?: string; width?: number; height?: number; }) {
    const user = UserStore.getUser(OWNER_ID);
    return (
        <img
            className={className}
            src={user ? IconUtils.getUserAvatarURL(user, false, 64) : IconUtils.getDefaultAvatarURL(OWNER_ID)}
            width={width}
            height={height}
            alt=""
            style={{ borderRadius: "50%" }}
        />
    );
}

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
            find: "ClockIcon;default:return",
            replacement: {
                match: /switch\((\i)\.id\)\{(case \i\.\i\.BUILT_IN:return \i\.\i;case \i\.\i\.FRECENCY:return \i\.ClockIcon;)default:return\}/,
                replace: "switch($1.id){$2default:return $self.icon($1)}"
            }
        }
    ],

    split(sections: Section[]) {
        const builtIn = sections.find(s => s.section.id === "-1");
        const mine = builtIn?.data.filter(isMine) ?? [];
        if (!builtIn || !mine.length) return;
        builtIn.data = builtIn.data.filter(c => !isMine(c));
        sections.splice(sections.indexOf(builtIn), builtIn.data.length ? 0 : 1, { section: SECTION, data: mine });
    },

    icon(section: { id: string; }) {
        return section.id === SECTION.id ? Avatar : undefined;
    }
});
