import React, { useState, useEffect } from 'react';
import styles from './AddFlowModal.module.css';
import { IconX } from './Icons';

export const AddFlowModal = ({ isOpen, onClose, onAdd }) => {
	const [formData, setFormData] = useState({
		flowName: '',
		description: '',
		conditionType: 'Path and Verb', // Custom, Path, Path and Verb
		path: '',
		verb: 'GET',
		targetUrl: ''
	});

	// Reset form when modal opens
	useEffect(() => {
		if (isOpen) {
			setFormData({
				flowName: '',
				description: '',
				conditionType: 'Path and Verb',
				path: '',
				verb: 'GET',
				targetUrl: ''
			});
		}
	}, [isOpen]);

	if (!isOpen) return null;

	const handleAdd = () => {
		let conditionXml = '';
		if (formData.conditionType === 'Path') {
			conditionXml = `(proxy.pathsuffix MatchesPath "${formData.path}")`;
		} else if (formData.conditionType === 'Path and Verb') {
			conditionXml = `(proxy.pathsuffix MatchesPath "${formData.path}") and (request.verb = "${formData.verb}")`;
		}

		const xmlBlock = `<Flow name="${formData.flowName}">
    <Description>${formData.description}</Description>
    <Request/>
    <Response/>
    ${conditionXml ? `<Condition>${conditionXml}</Condition>` : '<Condition/>'}
</Flow>`;

		onAdd(xmlBlock);
	};

	return (
		<div className={styles.overlay} onClick={onClose}>
			<div className={styles.modal} onClick={e => e.stopPropagation()}>
				<header className={styles.header}>
					<div className={styles.headerTitleGroup}>
						<h2>New Conditional Flow</h2>
					</div>
					<button className={styles.closeButton} onClick={onClose}>
						<IconX size={18} strokeWidth={2.5} />
					</button>
				</header>

				<div className={styles.container}>
					<main className={styles.formArea}>
						<div className={styles.formGroup}>
							<label>Flow Name</label>
							<input
								value={formData.flowName}
								onChange={e => setFormData({ ...formData, flowName: e.target.value })}
							/>
						</div>
						
						<div className={styles.formGroup}>
							<label>Description</label>
							<input
								value={formData.description}
								onChange={e => setFormData({ ...formData, description: e.target.value })}
							/>
						</div>

						<div className={styles.formGroupRadio}>
							<label>Condition Type</label>
							<div className={styles.radioOptions}>
								<label>
									<input 
										type="radio" 
										name="conditionType" 
										value="Custom"
										checked={formData.conditionType === 'Custom'}
										onChange={e => setFormData({ ...formData, conditionType: e.target.value })}
									/>
									Custom
								</label>
								<label>
									<input 
										type="radio" 
										name="conditionType" 
										value="Path"
										checked={formData.conditionType === 'Path'}
										onChange={e => setFormData({ ...formData, conditionType: e.target.value })}
									/>
									Path
								</label>
								<label>
									<input 
										type="radio" 
										name="conditionType" 
										value="Path and Verb"
										checked={formData.conditionType === 'Path and Verb'}
										onChange={e => setFormData({ ...formData, conditionType: e.target.value })}
									/>
									Path and Verb
								</label>
							</div>
						</div>

						<div className={styles.formGroup}>
							<label>Path</label>
							<input
								disabled={formData.conditionType === 'Custom'}
								value={formData.path}
								onChange={e => setFormData({ ...formData, path: e.target.value })}
							/>
						</div>

						<div className={styles.formGroup}>
							<label>Verb</label>
							<select
								disabled={formData.conditionType !== 'Path and Verb'}
								value={formData.verb}
								onChange={e => setFormData({ ...formData, verb: e.target.value })}
							>
								<option value="GET">GET</option>
								<option value="POST">POST</option>
								<option value="PUT">PUT</option>
								<option value="DELETE">DELETE</option>
								<option value="PATCH">PATCH</option>
							</select>
						</div>

						<div className={styles.formGroup}>
							<label>Optional Target URL</label>
							<input
								value={formData.targetUrl}
								onChange={e => setFormData({ ...formData, targetUrl: e.target.value })}
							/>
						</div>
					</main>
				</div>

				<footer className={styles.footer}>
					<button className={styles.btnCancel} onClick={onClose}>Cancel</button>
					<button
						className={styles.btnAdd}
						disabled={!formData.flowName.trim()}
						onClick={handleAdd}
					>
						Add
					</button>
				</footer>
			</div>
		</div>
	);
};