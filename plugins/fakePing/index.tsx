import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { updateMessage } from "@api/MessageUpdater";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { Menu } from "@webpack/common";

const originals = new Map<string, { channelId: string; mentioned: boolean; }>();

function toggle({ id, channel_id: channelId, mentioned }: Message) {
    if (!originals.has(id)) originals.set(id, { channelId, mentioned });
    updateMessage(channelId, id, { mentioned: !mentioned });
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
    authors: [{ name: "aquaryuo", id: 0n }],
    contextMenus: {
        "message": messageContextMenuPatch
    },
    stop() {
        for (const [id, { channelId, mentioned }] of originals) updateMessage(channelId, id, { mentioned });
        originals.clear();
    }
});
