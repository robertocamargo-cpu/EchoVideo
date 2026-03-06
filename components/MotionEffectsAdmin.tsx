import React, { useState, useEffect } from 'react';
import { Trash2, Edit2, Plus, Save, X, GripVertical } from 'lucide-react';
import { getMotionEffects, saveMotionEffect, deleteMotionEffect } from '../services/storageService';
import { MotionEffect } from '../types';

export const MotionEffectsAdmin: React.FC = () => {
    const [effects, setEffects] = useState<MotionEffect[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editingEffect, setEditingEffect] = useState<MotionEffect | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        loadEffects();
    }, []);

    const loadEffects = async () => {
        const data = await getMotionEffects();
        setEffects(data);
    };

    const handleCreate = () => {
        setEditingEffect({
            id: crypto.randomUUID(),
            name: '',
            description: '',
            instruction: '',
        });
        setIsCreating(true);
        setIsEditing(true);
    };

    const handleEdit = (effect: MotionEffect) => {
        setEditingEffect({ ...effect });
        setIsCreating(false);
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!editingEffect) return;

        try {
            const displayOrder = isCreating ? effects.length : effects.findIndex(e => e.id === editingEffect.id);
            await saveMotionEffect(editingEffect, displayOrder);
            await loadEffects();
            setIsEditing(false);
            setEditingEffect(null);
            setIsCreating(false);
        } catch (error) {
            alert('Erro ao salvar efeito');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este efeito?')) return;

        try {
            await deleteMotionEffect(id);
            await loadEffects();
        } catch (error) {
            alert('Erro ao excluir efeito');
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditingEffect(null);
        setIsCreating(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Efeitos de Movimento</h2>
                {!isEditing && (
                    <button
                        onClick={handleCreate}
                        className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 transition-all"
                    >
                        <Plus size={16} />
                        Novo Efeito
                    </button>
                )}
            </div>

            {isEditing && editingEffect && (
                <div className="bg-slate-900 border border-brand-500 rounded-2xl p-6 space-y-4">
                    <h3 className="text-lg font-black uppercase text-brand-400">
                        {isCreating ? 'Criar Novo Efeito' : 'Editar Efeito'}
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Título</label>
                            <input
                                type="text"
                                value={editingEffect.name}
                                onChange={(e) => setEditingEffect({ ...editingEffect, name: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-brand-500 focus:outline-none"
                                placeholder="Ex: Elevador Cinematográfico (Vertical Drift)"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Aplicação</label>
                            <textarea
                                value={editingEffect.description}
                                onChange={(e) => setEditingEffect({ ...editingEffect, description: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-brand-500 focus:outline-none min-h-[100px]"
                                placeholder="Descreva quando e como este efeito deve ser aplicado..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-400 mb-2">Instrução Técnica</label>
                            <textarea
                                value={editingEffect.instruction}
                                onChange={(e) => setEditingEffect({ ...editingEffect, instruction: e.target.value })}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-brand-500 focus:outline-none min-h-[120px]"
                                placeholder="Instruções técnicas detalhadas para implementação..."
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={handleCancel}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 transition-all"
                        >
                            <X size={16} />
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!editingEffect.name || !editingEffect.description || !editingEffect.instruction}
                            className="bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-black uppercase text-xs flex items-center gap-2 transition-all"
                        >
                            <Save size={16} />
                            Salvar
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {effects.map((effect) => (
                    <div
                        key={effect.id}
                        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-3">
                                <div className="flex items-center gap-3">
                                    <GripVertical size={20} className="text-slate-600 cursor-move" />
                                    <h3 className="text-lg font-bold text-white">{effect.name}</h3>
                                </div>

                                <div className="pl-8 space-y-2">
                                    <div>
                                        <span className="text-xs font-black uppercase text-brand-400">Aplicação:</span>
                                        <p className="text-sm text-slate-300 mt-1">{effect.description}</p>
                                    </div>

                                    <div>
                                        <span className="text-xs font-black uppercase text-slate-500">Instrução:</span>
                                        <p className="text-sm text-slate-400 mt-1 font-mono">{effect.instruction}</p>
                                    </div>
                                </div>
                            </div>

                            {!isEditing && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleEdit(effect)}
                                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(effect.id)}
                                        className="p-2 bg-slate-800 hover:bg-red-900 rounded-lg text-slate-400 hover:text-red-400 transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {effects.length === 0 && !isEditing && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="text-sm font-bold">Nenhum efeito cadastrado ainda.</p>
                        <p className="text-xs mt-2">Clique em "Novo Efeito" para começar.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
