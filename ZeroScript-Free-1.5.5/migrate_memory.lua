-- RanjiServer project-memory migration
-- Run this once in Roblox Studio with the place open.
-- It moves the existing memory ModuleScript from the old ZeroScript folder
-- into ServerStorage.RanjiServer.Memory.

local ServerStorage = game:GetService("ServerStorage")
local oldFolder = ServerStorage:FindFirstChild("ZeroScript")
local newFolder = ServerStorage:FindFirstChild("RanjiServer")

if not newFolder then
    newFolder = Instance.new("Folder")
    newFolder.Name = "RanjiServer"
    newFolder.Parent = ServerStorage
end

local memory = newFolder:FindFirstChild("Memory")
if not memory and oldFolder then
    memory = oldFolder:FindFirstChild("Memory")
    if memory then
        memory.Parent = newFolder
    end
end

if not memory then
    memory = Instance.new("ModuleScript")
    memory.Name = "Memory"
    memory.Source = [[return {
    Overview = "",
    WhereThingsLive = "",
    Conventions = "",
    KeySystems = "",
    DecisionsAndGotchas = "",
    UserPreferences = "",
    OpenQuestionsTODO = "",
}]]
    memory.Parent = newFolder
end

if oldFolder and #oldFolder:GetChildren() == 0 then
    oldFolder:Destroy()
end

return "Project memory is now at game.ServerStorage.RanjiServer.Memory"
