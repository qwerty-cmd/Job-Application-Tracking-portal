import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, GripVertical, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Interview } from "@/types";

interface InterviewListProps {
  interviews: Interview[];
  onAdd: () => void;
  onEdit: (interview: Interview) => void;
  onDelete: (interviewId: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
}

const OUTCOME_STYLES: Record<string, string> = {
  Passed: "bg-green-100 text-green-700 border-green-200",
  Failed: "bg-red-100 text-red-700 border-red-200",
  Pending: "bg-amber-100 text-amber-700 border-amber-200",
  Cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

function InterviewCard({
  interview,
  onEdit,
  onDelete,
}: {
  interview: Interview;
  onEdit: (interview: Interview) => void;
  onDelete: (interviewId: string) => Promise<void>;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: interview.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <button
            className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
            aria-label={`Drag to reorder Round ${interview.round}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                Round {interview.round}
              </span>
              <Badge variant="outline" className="text-xs">
                {interview.type}
              </Badge>
              <Badge
                variant="outline"
                className={OUTCOME_STYLES[interview.outcome] ?? ""}
              >
                {interview.outcome}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <Calendar
                className="mr-1 inline-block h-3.5 w-3.5"
                aria-hidden="true"
              />
              {interview.date}
              {interview.interviewers && (
                <>
                  {" · "}
                  <User
                    className="mr-1 inline-block h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  {interview.interviewers}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {interview.notes && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">Notes</p>
          <p className="mt-0.5 text-sm whitespace-pre-wrap">
            {interview.notes}
          </p>
        </div>
      )}

      {interview.reflection && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground">
            Reflection
          </p>
          <p className="mt-0.5 text-sm whitespace-pre-wrap">
            {interview.reflection}
          </p>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(interview)}>
          Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
        >
          Delete
        </Button>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Interview</AlertDialogTitle>
            <AlertDialogDescription>
              Remove Round {interview.round} ({interview.type}) from this
              application?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void onDelete(interview.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function InterviewList({
  interviews,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
}: InterviewListProps) {
  const sorted = [...interviews].sort((a, b) => a.order - b.order);
  const [items, setItems] = useState<Interview[]>(sorted);

  // Sync local order with props when interviews change (add/delete/API refetch)
  const fingerprint = useMemo(
    () => interviews.map((i) => `${i.id}:${i.order}`).join(","),
    [interviews],
  );
  const localFingerprint = items.map((i) => `${i.id}:${i.order}`).join(",");
  if (fingerprint !== localFingerprint) {
    setItems([...interviews].sort((a, b) => a.order - b.order));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    // Fire API call with new order
    void onReorder(reordered.map((i) => i.id));
  };

  return (
    <div className="rounded-lg border p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Interviews{" "}
          {interviews.length > 0 && (
            <span className="text-muted-foreground">({interviews.length})</span>
          )}
        </h2>
        <Button onClick={onAdd}>+ Add Interview</Button>
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No interviews recorded yet.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {items.map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
