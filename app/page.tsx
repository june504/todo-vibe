"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Trash2,
  Plus,
  Pencil,
  Filter,
  ArrowUpDown,
  TrendingUp,
  Edit3,
  Check,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabaseClient"

type Priority = "low" | "medium" | "high"

interface Todo {
  id: string
  text: string
  category: string
  priority: Priority
  dueDate: string
  completed: boolean
}

const categoryOptions = [
  { value: "업무", label: "업무" },
  { value: "개인", label: "개인" },
  { value: "학습", label: "학습" },
  { value: "기타", label: "기타" },
]

const priorityOptions: { value: Priority; label: string }[] = [
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
]

const selectFieldClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

const priorityBadgeStyles: Record<Priority, string> = {
  low: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  high: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200",
}

type FilterType = "all" | "completed" | "pending"
type SortType = "date" | "priority" | "category" | "name"
type FeedbackMessage = { type: "error" | "success"; message: string }

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [form, setForm] = useState<Omit<Todo, "id" | "completed">>({
    text: "",
    category: categoryOptions[0].value,
    priority: "medium",
    dueDate: "",
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Omit<Todo, "id" | "completed">>({
    text: "",
    category: categoryOptions[0].value,
    priority: "medium",
    dueDate: "",
  })
  const [filter, setFilter] = useState<FilterType>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<SortType>("date")
  const [fieldEditing, setFieldEditing] = useState<{
    id: string
    field: "category" | "priority" | "dueDate"
  } | null>(null)
  const [fieldEditValue, setFieldEditValue] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin")
  const [authLoading, setAuthLoading] = useState(false)

  const completedCount = useMemo(
    () => todos.filter((todo) => todo.completed).length,
    [todos]
  )

  const pendingCount = useMemo(
    () => todos.filter((todo) => !todo.completed).length,
    [todos]
  )

  const progressPercentage = useMemo(() => {
    if (todos.length === 0) return 0
    return Math.round((completedCount / todos.length) * 100)
  }, [todos.length, completedCount])

  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; completed: number }> = {}
    categoryOptions.forEach((cat) => {
      stats[cat.value] = { total: 0, completed: 0 }
    })
    todos.forEach((todo) => {
      stats[todo.category].total++
      if (todo.completed) {
        stats[todo.category].completed++
      }
    })
    return stats
  }, [todos])

  const filteredAndSortedTodos = useMemo(() => {
    let filtered = [...todos]

    // 필터링
    if (filter === "completed") {
      filtered = filtered.filter((todo) => todo.completed)
    } else if (filter === "pending") {
      filtered = filtered.filter((todo) => !todo.completed)
    }

    if (categoryFilter !== "all") {
      filtered = filtered.filter((todo) => todo.category === categoryFilter)
    }

    // 정렬
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "priority":
          const priorityOrder: Record<Priority, number> = { high: 3, medium: 2, low: 1 }
          return priorityOrder[b.priority] - priorityOrder[a.priority]
        case "category":
          return a.category.localeCompare(b.category)
        case "name":
          return a.text.localeCompare(b.text)
        case "date":
        default:
          if (!a.dueDate && !b.dueDate) return 0
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      }
    })

    return filtered
  }, [todos, filter, categoryFilter, sortBy])

  const resetForm = () =>
    setForm({
      text: "",
      category: categoryOptions[0].value,
      priority: "medium",
      dueDate: "",
    })

  const handleCreateChange = (
    field: keyof typeof form,
    value: string | Priority
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleEditChange = (
    field: keyof typeof editForm,
    value: string | Priority
  ) => {
    setEditForm((prev) => ({ ...prev, [field]: value }))
  }

  const mapRowToTodo = useCallback((row: any): Todo => {
    return {
      id: row.id,
      text: row.text,
      category: row.category,
      priority: row.priority as Priority,
      dueDate: row.due_date ?? "",
      completed: row.completed,
    }
  }, [])

  const reportError = useCallback((message: string, error?: unknown) => {
    console.error(message, error)
    setFeedback({ type: "error", message })
  }, [])

  const fetchTodos = useCallback(async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      reportError("할일을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", error)
      setIsLoading(false)
      return
    }

    const mapped = (data ?? []).map(mapRowToTodo)
    setTodos(mapped)
    setFeedback(null)
    setIsLoading(false)
  }, [mapRowToTodo, reportError])

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
    }
    getSession()

    const {
      data: authListener,
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (session) {
      fetchTodos()
    } else {
      setTodos([])
      setIsLoading(false)
    }
  }, [session, fetchTodos])

  const handleAuth = async (mode: "signin" | "signup") => {
    if (!authEmail || !authPassword) {
      reportError("이메일과 비밀번호를 입력해주세요.")
      return
    }

    setAuthLoading(true)
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword,
          })
        : await supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
          })

    setAuthLoading(false)

    if (error) {
      if (mode === "signup") {
        if (error.message?.toLowerCase().includes("password")) {
          reportError(
            "비밀번호가 너무 짧거나 정책에 맞지 않습니다. 최소 6자 이상 입력해주세요.",
            error
          )
          return
        }
        if (error.message?.toLowerCase().includes("already registered")) {
          reportError("이미 등록된 이메일입니다. 로그인으로 이동해주세요.", error)
          return
        }
      }

      if (
        mode === "signin" &&
        error.message?.toLowerCase().includes("email not confirmed")
      ) {
        reportError(
          "이메일 인증이 완료되지 않았습니다. 받은 메일에서 인증 링크를 확인해주세요.",
          error
        )
        return
      }

      reportError(
        mode === "signin"
          ? "로그인에 실패했습니다. 이메일/비밀번호를 확인해주세요."
          : "회원가입에 실패했습니다. 다시 시도해주세요.",
        error
      )
      return
    }

    setFeedback(
      mode === "signin"
        ? { type: "success", message: "로그인에 성공했습니다." }
        : {
            type: "success",
            message:
              "회원가입이 완료되었습니다. 받은 메일의 안내에 따라 인증을 완료해주세요.",
          }
    )
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setTodos([])
    setFeedback({ type: "success", message: "로그아웃되었습니다." })
  }

  const addTodo = async () => {
    if (!session) {
      reportError("로그인 후 할일을 추가할 수 있습니다.")
      return
    }
    if (form.text.trim() === "" || isSubmitting) return

    setIsSubmitting(true)
    const { data, error } = await supabase
      .from("todos")
      .insert({
        text: form.text.trim(),
        category: form.category,
        priority: form.priority,
        due_date: form.dueDate || null,
        completed: false,
      })
      .select("*")
      .single()

    if (error) {
      reportError("할일을 추가하지 못했습니다. 잠시 후 다시 시도해주세요.", error)
      setIsSubmitting(false)
      return
    }

    setTodos((prev) => [mapRowToTodo(data), ...prev])
    resetForm()
    setFeedback(null)
    setIsSubmitting(false)
  }

  const toggleTodo = async (id: string, completed: boolean) => {
    if (!session) return
    const { error } = await supabase
      .from("todos")
      .update({ completed: !completed })
      .eq("id", id)

    if (error) {
      reportError("상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.", error)
      return
    }

    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !completed } : todo
      )
    )
  }

  const deleteTodo = async (id: string) => {
    if (!session) return
    const { error } = await supabase.from("todos").delete().eq("id", id)

    if (error) {
      reportError("할일을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.", error)
      return
    }

    setTodos((prev) => prev.filter((todo) => todo.id !== id))
    if (editingId === id) {
      setEditingId(null)
    }
  }

  const startEditing = (todo: Todo) => {
    setEditingId(todo.id)
    setEditForm({
      text: todo.text,
      category: todo.category,
      priority: todo.priority,
      dueDate: todo.dueDate,
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
  }

  const saveEditing = async (id: string) => {
    if (!session) return
    if (editForm.text.trim() === "") return

    const { error } = await supabase
      .from("todos")
      .update({
        text: editForm.text.trim(),
        category: editForm.category,
        priority: editForm.priority,
        due_date: editForm.dueDate || null,
      })
      .eq("id", id)

    if (error) {
      reportError("할일을 수정하지 못했습니다. 잠시 후 다시 시도해주세요.", error)
      return
    }

    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              text: editForm.text.trim(),
              category: editForm.category,
              priority: editForm.priority,
              dueDate: editForm.dueDate,
            }
          : todo
      )
    )
    setEditingId(null)
  }

  const startFieldEditing = (todo: Todo, field: "category" | "priority" | "dueDate") => {
    setFieldEditing({ id: todo.id, field })
    if (field === "category") {
      setFieldEditValue(todo.category)
    } else if (field === "priority") {
      setFieldEditValue(todo.priority)
    } else {
      setFieldEditValue(todo.dueDate ?? "")
    }
  }

  const cancelFieldEditing = () => {
    setFieldEditing(null)
    setFieldEditValue("")
  }

  const saveFieldEditing = async () => {
    if (!fieldEditing) return
    if (!session) return
    const { id, field } = fieldEditing
    const value =
      field === "priority"
        ? (fieldEditValue as Priority)
        : fieldEditValue

    const payload =
      field === "dueDate"
        ? { due_date: value || null }
        : { [field]: value }

    const { error } = await supabase.from("todos").update(payload).eq("id", id)

    if (error) {
      reportError("필드를 수정하지 못했습니다. 잠시 후 다시 시도해주세요.", error)
      return
    }

    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              [field]: field === "dueDate" ? (value as string) : value,
            }
          : todo
      )
    )
    setFieldEditing(null)
    setFieldEditValue("")
  }

  const formattedDueDate = (value: string | null | undefined) => {
    if (!value) return "기한 없음"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "기한 없음"
    return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date)
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      addTodo()
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
        <div className="mx-auto flex max-w-lg flex-col gap-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
              로그인 또는 회원가입
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              이메일과 비밀번호로 로그인하거나 회원가입하세요.
            </p>
          </div>
          {feedback && (
            <div
              className={cn(
                "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm",
                feedback.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-100"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
              )}
            >
              <p>{feedback.message}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setFeedback(null)}
              >
                닫기
              </Button>
            </div>
          )}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>
                {authMode === "signin" ? "로그인" : "회원가입"}
              </CardTitle>
              <CardDescription>
                {authMode === "signin"
                  ? "등록된 계정으로 로그인하세요."
                  : "새 계정을 만들어 사용하세요."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-email">이메일</Label>
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-password">비밀번호</Label>
                <Input
                  id="auth-password"
                  type="password"
                  placeholder="******"
                  value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAuth(authMode)
                      }
                    }}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => handleAuth(authMode)}
                disabled={authLoading}
              >
                {authMode === "signin" ? "로그인" : "회원가입"}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-sm text-muted-foreground"
                onClick={() =>
                  setAuthMode(authMode === "signin" ? "signup" : "signin")
                }
              >
                {authMode === "signin"
                  ? "계정이 없나요? 회원가입하기"
                  : "이미 계정이 있나요? 로그인하기"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8 pb-20">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50">
            할일 목록
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            카테고리, 우선순위, 마감일로 스마트하게 관리하세요
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <Card className="shadow-lg">
                <CardContent className="pt-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">전체 진행률</p>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <p className="text-2xl font-bold">{progressPercentage}%</p>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">완료된 일</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {completedCount}개
                    </p>
                    <p className="text-xs text-muted-foreground">전체 {todos.length}개 중</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">남은 일</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {pendingCount}개
                    </p>
                    <p className="text-xs text-muted-foreground">완료 대기 중</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-5">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">전체 할일</p>
                    <p className="text-2xl font-bold">{todos.length}개</p>
                    <p className="text-xs text-muted-foreground">모든 카테고리 포함</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {session.user?.email}
                </p>
                <p className="text-base font-semibold">현재 로그인 중</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                로그아웃
              </Button>
            </div>

            <Card className="shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">카테고리별 현황</CardTitle>
                <CardDescription className="text-xs">
                  각 카테고리별 할일 진행 상황을 확인하세요
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {categoryOptions.map((category) => {
                  const stats = categoryStats[category.value]
                  const catProgress =
                    stats.total > 0
                      ? Math.round((stats.completed / stats.total) * 100)
                      : 0
                  return (
                    <div
                      key={category.value}
                      className="rounded-lg border border-dashed bg-card/70 p-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span>{category.label}</span>
                        <span className="text-xs text-muted-foreground">{catProgress}%</span>
                      </div>
                      <div className="mt-2 w-full bg-secondary rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${catProgress}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>완료: {stats.completed}</span>
                        <span>전체: {stats.total}</span>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {feedback && (
              <div
                className={cn(
                  "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm",
                  feedback.type === "error"
                    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                )}
              >
                <p>{feedback.message}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setFeedback(null)}
                >
                  닫기
                </Button>
              </div>
            )}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>새 할일 추가</CardTitle>
                <CardDescription>
                  내용, 카테고리, 우선순위, 기한을 지정해 추가할 수 있어요.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="todo-text">할일 내용</Label>
              <Input
                id="todo-text"
                placeholder="할일을 입력하세요..."
                value={form.text}
                onChange={(e) => handleCreateChange("text", e.target.value)}
                onKeyDown={handleKeyPress}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="todo-category">카테고리</Label>
                <select
                  id="todo-category"
                  className={selectFieldClass}
                  value={form.category}
                  onChange={(e) => handleCreateChange("category", e.target.value)}
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="todo-priority">우선순위</Label>
                <select
                  id="todo-priority"
                  className={selectFieldClass}
                  value={form.priority}
                  onChange={(e) =>
                    handleCreateChange("priority", e.target.value as Priority)
                  }
                >
                  {priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="todo-due">마감일</Label>
                <Input
                  id="todo-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => handleCreateChange("dueDate", e.target.value)}
                />
              </div>
            </div>

            <Button onClick={addTodo} className="w-full gap-2" disabled={isSubmitting}>
              <Plus className="h-4 w-4" />
              할일 추가
            </Button>
          </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>
                  할일 목록 {filteredAndSortedTodos.length > 0 && `(${filteredAndSortedTodos.length})`}
                </CardTitle>
                <CardDescription>
                  {todos.length === 0
                    ? "아직 할일이 없습니다. 위에서 새 할일을 추가해보세요!"
                    : `${completedCount}개 완료됨`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
            {/* 필터 및 정렬 */}
            {todos.length > 0 && (
              <div className="flex flex-wrap gap-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">필터:</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    className={selectFieldClass}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as FilterType)}
                  >
                    <option value="all">전체</option>
                    <option value="pending">미완료</option>
                    <option value="completed">완료</option>
                  </select>
                  <select
                    className={selectFieldClass}
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">모든 카테고리</option>
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">정렬:</Label>
                  <select
                    className={selectFieldClass}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortType)}
                  >
                    <option value="date">마감일</option>
                    <option value="priority">우선순위</option>
                    <option value="category">카테고리</option>
                    <option value="name">이름</option>
                  </select>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                데이터를 불러오는 중입니다...
              </div>
            ) : todos.length === 0 ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                <p className="text-lg">할일이 없습니다</p>
                <p className="text-sm mt-2">새로운 할일을 추가해보세요!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAndSortedTodos.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    <p className="text-lg">필터 조건에 맞는 할일이 없습니다</p>
                    <p className="text-sm mt-2">필터를 변경해보세요</p>
                  </div>
                ) : (
                  filteredAndSortedTodos.map((todo) => {
                  const isEditing = editingId === todo.id
                  const priorityLabel =
                    priorityOptions.find((p) => p.value === todo.priority)
                      ?.label ?? "보통"

                  return (
                    <div
                      key={todo.id}
                      className="rounded-lg border bg-card p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={todo.completed}
                            onCheckedChange={() => toggleTodo(todo.id, todo.completed)}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-2">
                            <div className="flex flex-wrap gap-2">
                              {(["priority", "category", "dueDate"] as const).map(
                                (fieldKey) => {
                                  const isFieldEditing =
                                    fieldEditing?.id === todo.id &&
                                    fieldEditing.field === fieldKey
                                  const fieldLabel =
                                    fieldKey === "priority"
                                      ? "우선순위"
                                      : fieldKey === "category"
                                        ? "카테고리"
                                        : "마감"
                                  const fieldValue =
                                    fieldKey === "priority"
                                      ? priorityLabel
                                      : fieldKey === "category"
                                        ? todo.category
                                        : formattedDueDate(todo.dueDate)

                                  return (
                                    <div key={fieldKey} className="min-w-[140px]">
                                      {isFieldEditing ? (
                                        <div className="flex flex-wrap items-center gap-2 rounded-full border bg-muted/60 px-3 py-1.5 text-xs">
                                          {fieldKey === "category" && (
                                            <select
                                              className="flex-1 bg-transparent text-xs outline-none"
                                              value={fieldEditValue}
                                              onChange={(e) => setFieldEditValue(e.target.value)}
                                            >
                                              {categoryOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                  {option.label}
                                                </option>
                                              ))}
                                            </select>
                                          )}
                                          {fieldKey === "priority" && (
                                            <select
                                              className="flex-1 bg-transparent text-xs outline-none"
                                              value={fieldEditValue}
                                              onChange={(e) =>
                                                setFieldEditValue(e.target.value as Priority)
                                              }
                                            >
                                              {priorityOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                  {option.label}
                                                </option>
                                              ))}
                                            </select>
                                          )}
                                          {fieldKey === "dueDate" && (
                                            <Input
                                              type="date"
                                              value={fieldEditValue}
                                              onChange={(e) => setFieldEditValue(e.target.value)}
                                              className="h-6 flex-1 border-none bg-transparent p-0 text-xs focus-visible:ring-0"
                                            />
                                          )}
                                          <div className="flex items-center gap-1">
                                            <Button
                                              size="sm"
                                              className="h-6 px-2 text-xs"
                                              onClick={saveFieldEditing}
                                            >
                                              <Check className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-xs"
                                              onClick={cancelFieldEditing}
                                            >
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => startFieldEditing(todo, fieldKey)}
                                          disabled={editingId === todo.id}
                                          className={cn(
                                            "group inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5",
                                            fieldKey === "priority" && priorityBadgeStyles[todo.priority]
                                          )}
                                        >
                                          <span className="text-muted-foreground">{fieldLabel}</span>
                                          <span className="font-semibold">{fieldValue}</span>
                                          <Edit3 className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                                        </button>
                                      )}
                                    </div>
                                  )
                                }
                              )}
                            </div>
                            {isEditing ? (
                              <div className="space-y-3">
                                <Input
                                  value={editForm.text}
                                  onChange={(e) =>
                                    handleEditChange("text", e.target.value)
                                  }
                                />
                                <div className="grid gap-3 md:grid-cols-3">
                                  <select
                                    className={selectFieldClass}
                                    value={editForm.category}
                                    onChange={(e) =>
                                      handleEditChange(
                                        "category",
                                        e.target.value
                                      )
                                    }
                                  >
                                    {categoryOptions.map((option) => (
                                      <option
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    className={selectFieldClass}
                                    value={editForm.priority}
                                    onChange={(e) =>
                                      handleEditChange(
                                        "priority",
                                        e.target.value as Priority
                                      )
                                    }
                                  >
                                    {priorityOptions.map((option) => (
                                      <option
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  <Input
                                    type="date"
                                    value={editForm.dueDate}
                                    onChange={(e) =>
                                      handleEditChange("dueDate", e.target.value)
                                    }
                                  />
                                </div>
                              </div>
                            ) : (
                              <p
                                className={cn(
                                  "text-base leading-relaxed",
                                  todo.completed
                                    ? "line-through text-muted-foreground"
                                    : "text-foreground"
                                )}
                              >
                                {todo.text}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={cancelEditing}
                              >
                                취소
                              </Button>
                                <Button
                                size="sm"
                                onClick={() => saveEditing(todo.id)}
                              >
                                저장
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                onClick={() => startEditing(todo)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                편집
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => deleteTodo(todo.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                삭제
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                  })
                )}
              </div>
            )}
          </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
