import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { updateMessage } from "@api/MessageUpdater";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { Menu, MessageStore } from "@webpack/common";

const originals = new Map<string, { channelId: string; mentioned: boolean; }>();
const forced = new Map<string, boolean>();

function toggle({ id, channel_id: channelId, mentioned }: Message) {
    const current = MessageStore.getMessage(channelId, id)?.mentioned ?? mentioned;
    const original = originals.get(id) ?? { channelId, mentioned: current };
    if (current === original.mentioned) {
        originals.set(id, original);
        forced.set(id, !current);
    } else {
        originals.delete(id);
        forced.delete(id);
    }
    updateMessage(channelId, id, { mentioned: !current });
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    children.push(
        <Menu.MenuCheckboxItem
            id="vc-fake-ping"
            label="Fake Ping"
            checked={message.mentioned}
            action={() => toggle(message)}
        />
    );
};

export default definePlugin({
    name: "FakePing",
    description: "Right-click a message and pick Fake Ping to highlight it like a ping. Only you see it.",
    authors: [{ name: "aquaryuo", id: 975151124824879125n }],
    contextMenus: {
        "message": messageContextMenuPatch
    },
    patches: [
        {
            find: 'set("mentioned",',
            replacement: [
                {
                    match: /mentioned:(\(0,\i\.\i\)\(\{userId:\i\.default\.getId\(\),channelId:(\i)\.channel_id[^}]*\}\))/,
                    replace: "mentioned:$self.mentioned($2.id,$1)"
                },
                {
                    match: /(\.set\("mentioned",)(\(0,\i\.\i\)\(\{message:(\i),userId:[^}]+\}\))/,
                    replace: "$1$self.mentioned($3.id,$2)"
                }
            ]
        }
    ],
    mentioned(id: string, mentioned: boolean) {
        return forced.get(id) ?? mentioned;
    },
    stop() {
        forced.clear();
        for (const [id, { channelId, mentioned }] of originals) updateMessage(channelId, id, { mentioned });
        originals.clear();
    }
});
