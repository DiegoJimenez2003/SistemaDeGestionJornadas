import TaskList from "../components/TaskList";

export default function MyTasksPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex justify-center px-4 pt-16 pb-10">
      <div className="w-full max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold text-center mb-6" style={{ color: "#37788a" }}>
          Mis Tareas
        </h1>
        <TaskList />
      </div>
    </div>
  );
}
